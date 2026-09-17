/**
 * Image ingestion.
 *
 * Every upload is re-encoded through sharp. That is the security control as
 * much as the optimisation: re-encoding destroys polyglot files and embedded
 * payloads, and EXIF stripping removes GPS coordinates a merchant did not
 * intend to publish.
 *
 * Processing happens once at upload rather than per request, because an image
 * is uploaded once and served on every scan.
 */
import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { withTenant } from '../tenancy';
import { schema } from '../db/client';
import { storage, tenantKey } from './storage';

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const VARIANT_WIDTHS = [400, 800, 1600] as const;

export class UploadRejected extends Error {
  override readonly name = 'UploadRejected';
  readonly status = 400;
}

/**
 * Content sniffing by magic bytes. The declared MIME type and the filename
 * extension are attacker-controlled and are never trusted.
 */
export function sniffImageType(buffer: Buffer): 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.subarray(0, 3).toString('ascii') === 'GIF') return 'gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp';
  }
  const brand = buffer.subarray(4, 12).toString('ascii');
  if (brand.startsWith('ftyp') && (brand.includes('avif') || brand.includes('avis'))) return 'avif';
  return null;
}

export type UploadResult = {
  mediaId: string;
  variants: Record<string, string>;
  width: number;
  height: number;
};

export async function ingestImage(args: {
  tenantId: string;
  buffer: Buffer;
  kind: 'logo' | 'cover' | 'gallery' | 'catalog' | 'offer';
  altText?: string | null;
}): Promise<UploadResult> {
  const { tenantId, buffer } = args;

  if (buffer.byteLength === 0) throw new UploadRejected('The file is empty.');
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadRejected('Images must be 12 MB or smaller.');
  }
  const sniffed = sniffImageType(buffer);
  if (!sniffed) throw new UploadRejected('That file is not a supported image.');

  const source = sharp(buffer, { failOn: 'error' });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) throw new UploadRejected('Could not read that image.');
  // Guards against decompression-bomb style inputs.
  if (metadata.width * metadata.height > 50_000_000) {
    throw new UploadRejected('That image is too large. Please use a smaller photo.');
  }

  const checksum = createHash('sha256').update(buffer).digest('hex');

  const mediaId = await withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .insert(schema.media)
      .values({
        tenantId,
        storageKey: '',
        kind: args.kind,
        mime: 'image/avif',
        bytes: buffer.byteLength,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        altText: args.altText ?? null,
        checksum,
      })
      .returning({ id: schema.media.id });
    if (!row) throw new Error('failed to create media row');
    return row.id;
  });

  const variants: Record<string, string> = {};
  const store = storage();

  for (const width of VARIANT_WIDTHS) {
    if (metadata.width < width && width !== VARIANT_WIDTHS[0]) continue;

    // rotate() applies the EXIF orientation, then metadata is dropped entirely.
    const base = sharp(buffer).rotate().resize({ width, withoutEnlargement: true });

    const avif = await base.clone().avif({ quality: 55, effort: 4 }).toBuffer();
    const avifKey = tenantKey(tenantId, mediaId, `${width}.avif`);
    await store.put(avifKey, avif, 'image/avif');
    variants[`avif_${width}`] = avifKey;

    const webp = await base.clone().webp({ quality: 74 }).toBuffer();
    const webpKey = tenantKey(tenantId, mediaId, `${width}.webp`);
    await store.put(webpKey, webp, 'image/webp');
    variants[`webp_${width}`] = webpKey;
  }

  const primaryKey = variants[`avif_${VARIANT_WIDTHS[1]}`] ?? variants[`avif_${VARIANT_WIDTHS[0]}`] ?? '';

  await withTenant(tenantId, async ({ tx }) => {
    await tx
      .update(schema.media)
      .set({ storageKey: primaryKey, variants: variants as never })
      .where(eq(schema.media.id, mediaId));
    await tx
      .update(schema.tenants)
      .set({ contextVersion: sql`${schema.tenants.contextVersion} + 1` })
      .where(eq(schema.tenants.id, tenantId));
  });

  return { mediaId, variants, width: metadata.width, height: metadata.height };
}

/** Best available variant at or above the requested width. */
export function pickVariant(
  variants: Record<string, string>,
  format: 'avif' | 'webp',
  width: number,
): string | null {
  const candidates = VARIANT_WIDTHS.filter((w) => w >= width);
  for (const w of candidates.length ? candidates : [...VARIANT_WIDTHS].reverse()) {
    const key = variants[`${format}_${w}`];
    if (key) return key;
  }
  return null;
}
