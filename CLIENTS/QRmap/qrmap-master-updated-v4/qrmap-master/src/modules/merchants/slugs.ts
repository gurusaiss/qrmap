/**
 * Slug allocation and resolution.
 *
 * THE INVARIANT: a slug is globally unique across all time and is never reused
 * and never deleted. Renaming mints a new primary slug and demotes the old one
 * to an alias that redirects forever. Reusing a slug would point an already
 * printed QR code at a different business, which is the worst failure this
 * system can produce (decision D12).
 *
 * Enforced at three levels: this module, a DELETE trigger, and the absence of
 * any DELETE grant on merchant_slugs.
 */
import { and, eq, sql } from 'drizzle-orm';
import { withSystem } from '../tenancy';
import { schema } from '../db/client';
import { RESERVED_SLUGS, normalizeSlugInput, slugCandidates, validateSlug, type SlugError } from '../core/slug';
import { recordAudit } from '../core/audit';

export class SlugUnavailableError extends Error {
  override readonly name = 'SlugUnavailableError';
  constructor(readonly reason: SlugError | 'taken') {
    super(reason === 'taken' ? 'That web address is already taken.' : `Invalid slug: ${reason}`);
  }
}

export async function isSlugAvailable(slug: string): Promise<boolean> {
  if (validateSlug(slug) !== null) return false;
  return withSystem(async ({ tx }) => {
    const [row] = await tx
      .select({ slug: schema.merchantSlugs.slug })
      .from(schema.merchantSlugs)
      .where(eq(schema.merchantSlugs.slug, slug))
      .limit(1);
    return row === undefined;
  });
}

/** Picks the first available candidate derived from the business name. */
export async function suggestSlug(businessName: string, city?: string | null): Promise<string> {
  const candidates = slugCandidates(businessName, city);
  for (const candidate of candidates) {
    if (await isSlugAvailable(candidate)) return candidate;
  }
  // Deterministic candidates exhausted; fall back to a suffixed form.
  const base = candidates[0] ?? 'shop';
  for (let i = 0; i < 20; i++) {
    const suffix = Math.random().toString(36).slice(2, 6);
    const candidate = `${base.slice(0, 33)}-${suffix}`;
    if (validateSlug(candidate) === null && (await isSlugAvailable(candidate))) return candidate;
  }
  throw new SlugUnavailableError('taken');
}

type Tx = Parameters<Parameters<typeof withSystem>[0]>[0]['tx'];

/**
 * Claims `slug` as the tenant's primary address, demoting any previous primary
 * to a permanent alias. Runs inside the caller's transaction so allocation and
 * demotion cannot interleave.
 */
export async function claimPrimarySlug(tx: Tx, tenantId: string, slug: string): Promise<void> {
  const invalid = validateSlug(slug);
  if (invalid) throw new SlugUnavailableError(invalid);
  if (RESERVED_SLUGS.has(slug)) throw new SlugUnavailableError('reserved');

  const [existing] = await tx
    .select()
    .from(schema.merchantSlugs)
    .where(eq(schema.merchantSlugs.slug, slug))
    .limit(1);

  if (existing && existing.tenantId !== tenantId) throw new SlugUnavailableError('taken');

  // Demote the current primary to an alias. It keeps resolving forever.
  await tx
    .update(schema.merchantSlugs)
    .set({ isPrimary: false, retiredAt: new Date() })
    .where(
      and(eq(schema.merchantSlugs.tenantId, tenantId), eq(schema.merchantSlugs.isPrimary, true)),
    );

  if (existing) {
    await tx
      .update(schema.merchantSlugs)
      .set({ isPrimary: true, retiredAt: null })
      .where(eq(schema.merchantSlugs.slug, slug));
  } else {
    await tx.insert(schema.merchantSlugs).values({ slug, tenantId, isPrimary: true });
  }
}

export async function changeSlug(args: {
  tenantId: string;
  newSlug: string;
  actorUserId: string;
}): Promise<{ previousSlug: string | null; newSlug: string }> {
  // Same cleanup as a typed slug at tenant creation: casing/spacing/
  // punctuation is fixed up rather than rejected outright.
  const newSlug = normalizeSlugInput(args.newSlug);
  const previousSlug = await primarySlugFor(args.tenantId);
  await withSystem(({ tx }) => claimPrimarySlug(tx, args.tenantId, newSlug));
  await recordAudit({
    action: 'slug.change',
    actorUserId: args.actorUserId,
    actorType: 'platform',
    tenantId: args.tenantId,
    entityType: 'merchant_slug',
    entityId: newSlug,
    before: { slug: previousSlug },
    after: { slug: newSlug, previousStillRedirects: true },
  });
  return { previousSlug, newSlug };
}

export async function primarySlugFor(tenantId: string): Promise<string | null> {
  return withSystem(async ({ tx }) => {
    const [row] = await tx
      .select({ slug: schema.merchantSlugs.slug })
      .from(schema.merchantSlugs)
      .where(
        and(eq(schema.merchantSlugs.tenantId, tenantId), eq(schema.merchantSlugs.isPrimary, true)),
      )
      .limit(1);
    return row?.slug ?? null;
  });
}

export type SlugResolution =
  | { kind: 'canonical'; tenantId: string; slug: string }
  | { kind: 'alias'; tenantId: string; canonicalSlug: string }
  | { kind: 'unknown' };

/**
 * Resolves a slug from a scanned URL. This is the ONLY place the public page
 * learns which tenant it is rendering, and it is server-side by construction.
 */
export async function resolveSlug(slug: string): Promise<SlugResolution> {
  const normalised = slug.trim().toLowerCase();
  if (validateSlug(normalised) !== null) return { kind: 'unknown' };

  return withSystem(async ({ tx }) => {
    const [row] = await tx
      .select()
      .from(schema.merchantSlugs)
      .where(eq(schema.merchantSlugs.slug, normalised))
      .limit(1);
    if (!row) return { kind: 'unknown' };
    if (row.isPrimary) return { kind: 'canonical', tenantId: row.tenantId, slug: row.slug };

    const [primary] = await tx
      .select({ slug: schema.merchantSlugs.slug })
      .from(schema.merchantSlugs)
      .where(
        and(eq(schema.merchantSlugs.tenantId, row.tenantId), eq(schema.merchantSlugs.isPrimary, true)),
      )
      .limit(1);

    // An alias with no current primary should be impossible; treat as unknown
    // rather than serving a page we cannot name.
    if (!primary) return { kind: 'unknown' };
    return { kind: 'alias', tenantId: row.tenantId, canonicalSlug: primary.slug };
  });
}

/** Resolves the permanent short alias /q/{token}. */
export async function resolveQrToken(token: string): Promise<{ tenantId: string; slug: string } | null> {
  if (!/^[a-z0-9]{4,32}$/.test(token)) return null;
  return withSystem(async ({ tx }) => {
    const [qr] = await tx
      .select()
      .from(schema.qrCodes)
      .where(eq(schema.qrCodes.token, token))
      .limit(1);
    if (!qr) return null;
    const [primary] = await tx
      .select({ slug: schema.merchantSlugs.slug })
      .from(schema.merchantSlugs)
      .where(
        and(eq(schema.merchantSlugs.tenantId, qr.tenantId), eq(schema.merchantSlugs.isPrimary, true)),
      )
      .limit(1);
    return primary ? { tenantId: qr.tenantId, slug: primary.slug } : null;
  });
}

/** Every address that has ever pointed at this tenant, newest first. */
export async function slugHistory(tenantId: string): Promise<
  { slug: string; isPrimary: boolean; retiredAt: Date | null; createdAt: Date }[]
> {
  return withSystem(({ tx }) =>
    tx
      .select({
        slug: schema.merchantSlugs.slug,
        isPrimary: schema.merchantSlugs.isPrimary,
        retiredAt: schema.merchantSlugs.retiredAt,
        createdAt: schema.merchantSlugs.createdAt,
      })
      .from(schema.merchantSlugs)
      .where(eq(schema.merchantSlugs.tenantId, tenantId))
      .orderBy(sql`${schema.merchantSlugs.isPrimary} DESC, ${schema.merchantSlugs.createdAt} DESC`),
  );
}
