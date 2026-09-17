/**
 * QR generation.
 *
 * Built in-house rather than bought: QR SaaS is priced per code ($5-99/mo for
 * 3-500 codes), which is economically impossible when we need one permanent
 * code per merchant, and it would put our most permanence-critical asset inside
 * a third party (decision D9).
 *
 * The encoded URL is derived from the tenant's primary slug every time. No QR
 * image is ever stored as a source of truth, so no stored artefact can drift
 * away from the URL it is supposed to represent.
 */
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type ErrorCorrection = 'L' | 'M' | 'Q' | 'H';

export type QrStyle = {
  /** Dark module colour. Must be dark enough to scan. */
  foreground: string;
  background: string;
  /** Embedding a logo requires level Q so the covered modules can be recovered. */
  withLogo: boolean;
  /** Pixel width for raster output. */
  size: number;
};

export const DEFAULT_STYLE: QrStyle = {
  foreground: '#000000',
  background: '#FFFFFF',
  withLogo: false,
  size: 1024,
};

/** Quiet zone of 4 modules is mandatory and not configurable - codes without it fail to scan. */
const QUIET_ZONE_MODULES = 4;

export function errorCorrectionFor(style: Pick<QrStyle, 'withLogo'>): ErrorCorrection {
  // Never embed a logo at level M: the logo covers modules that level M cannot recover.
  return style.withLogo ? 'Q' : 'M';
}

export class QrContrastError extends Error {
  override readonly name = 'QrContrastError';
}

export class QrVerificationError extends Error {
  override readonly name = 'QrVerificationError';
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function relativeLuminance(c: { r: number; g: number; b: number }): number {
  const f = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Scanners need strong contrast AND a dark-on-light polarity. We reject bad
 * combinations rather than letting a merchant produce an unscannable code.
 */
export function assertScannableColours(style: QrStyle): void {
  const ratio = contrastRatio(style.foreground, style.background);
  if (ratio === null) throw new QrContrastError('Colours must be six-digit hex values.');
  if (ratio < 7) {
    throw new QrContrastError(
      'Not enough contrast between the code and its background. Choose a darker code colour or a lighter background.',
    );
  }
  const fg = parseHex(style.foreground);
  const bg = parseHex(style.background);
  if (fg && bg && relativeLuminance(fg) > relativeLuminance(bg)) {
    throw new QrContrastError('The code must be darker than its background.');
  }
}

export function publicUrlForSlug(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, '')}/m/${slug}`;
}

export function shortUrlForToken(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/q/${token}`;
}

type RenderOptions = Partial<QrStyle>;

function resolveStyle(options: RenderOptions | undefined): QrStyle {
  const style = { ...DEFAULT_STYLE, ...options };
  assertScannableColours(style);
  return style;
}

export async function renderPng(url: string, options?: RenderOptions): Promise<Buffer> {
  const style = resolveStyle(options);
  return QRCode.toBuffer(url, {
    type: 'png',
    errorCorrectionLevel: errorCorrectionFor(style),
    margin: QUIET_ZONE_MODULES,
    width: style.size,
    color: { dark: style.foreground, light: style.background },
  });
}

export async function renderSvg(url: string, options?: RenderOptions): Promise<string> {
  const style = resolveStyle(options);
  return QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: errorCorrectionFor(style),
    margin: QUIET_ZONE_MODULES,
    width: style.size,
    color: { dark: style.foreground, light: style.background },
  });
}

/**
 * Decodes a rendered code and checks it resolves back to the expected URL.
 * A code that does not decode is never offered for download - the merchant
 * would otherwise print it and only discover the problem in the shop.
 */
export async function verifyDecodes(png: Buffer, expectedUrl: string): Promise<void> {
  const [{ default: jsQR }, { default: sharp }] = await Promise.all([
    import('jsqr'),
    import('sharp'),
  ]);
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  if (!result) throw new QrVerificationError('Generated code could not be decoded.');
  if (result.data !== expectedUrl) {
    throw new QrVerificationError(
      `Generated code decodes to the wrong address (${result.data}).`,
    );
  }
}

/** Renders and verifies in one step. Use this for anything a merchant downloads. */
export async function renderVerifiedPng(url: string, options?: RenderOptions): Promise<Buffer> {
  const png = await renderPng(url, options);
  await verifyDecodes(png, url);
  return png;
}

/**
 * Print-ready A5 standee. The URL is printed in text beneath the code so the
 * page stays reachable if the code is damaged, or if the customer prefers to type.
 */
export async function renderStandeePdf(args: {
  url: string;
  businessName: string;
  callToAction?: string;
  style?: RenderOptions;
}): Promise<Uint8Array> {
  const png = await renderVerifiedPng(args.url, args.style);

  const doc = await PDFDocument.create();
  // A5 at 72dpi
  const page = doc.addPage([420, 595]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const image = await doc.embedPng(png);

  const centre = (text: string, font: typeof bold, size: number, y: number): void => {
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (420 - width) / 2, y, size, font, color: rgb(0.06, 0.06, 0.08) });
  };

  const name = args.businessName.length > 34 ? `${args.businessName.slice(0, 33)}…` : args.businessName;
  centre(name, bold, 20, 520);
  centre(args.callToAction ?? 'Scan for offers, prices & contact', regular, 11, 498);

  const qrSize = 300;
  page.drawImage(image, { x: (420 - qrSize) / 2, y: 170, width: qrSize, height: qrSize });

  const printable = args.url.replace(/^https?:\/\//, '');
  centre(printable, regular, 11, 140);
  centre('Point your phone camera at the code', regular, 9, 118);

  return doc.save();
}

/** Opaque, URL-safe, unambiguous token for the permanent /q/{token} alias. */
export function generateQrToken(bytes = 8): string {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz'; // no 0/1/i/l/o
  const random = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(random);
  let out = '';
  for (const b of random) out += alphabet[b % alphabet.length];
  return out;
}

/**
 * Smallest reliable print size. Short URLs produce fewer modules, which is why
 * slugs are kept short.
 */
export function minimumPrintSizeMm(url: string): number {
  const modules = url.length <= 30 ? 33 : url.length <= 60 ? 41 : 49;
  // ~0.6mm per module is the practical floor for phone cameras.
  return Math.ceil(modules * 0.6);
}
