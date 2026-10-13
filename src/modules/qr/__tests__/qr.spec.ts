import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STYLE,
  QrContrastError,
  QrVerificationError,
  assertScannableColours,
  contrastRatio,
  errorCorrectionFor,
  generateQrToken,
  minimumPrintSizeMm,
  publicUrlForSlug,
  renderPng,
  renderStandeePdf,
  renderSvg,
  renderVerifiedPng,
  renderVerifiedSvg,
  verifyDecodes,
} from '../index';

const ORIGIN = 'https://example.com';

describe('URL construction', () => {
  it('builds the canonical merchant URL from the slug', () => {
    expect(publicUrlForSlug(ORIGIN, 'sharma-salon')).toBe('https://example.com/m/sharma-salon');
  });

  it('tolerates a trailing slash on the origin', () => {
    expect(publicUrlForSlug('https://example.com/', 'a-shop')).toBe('https://example.com/m/a-shop');
  });
});

describe('error correction', () => {
  it('uses level Q when a logo is embedded so covered modules can be recovered', () => {
    expect(errorCorrectionFor({ withLogo: true })).toBe('Q');
  });

  it('uses level M when there is no logo', () => {
    expect(errorCorrectionFor({ withLogo: false })).toBe('M');
  });
});

describe('colour validation', () => {
  it('accepts the default black on white', () => {
    expect(() => assertScannableColours(DEFAULT_STYLE)).not.toThrow();
  });

  it('rejects low-contrast combinations rather than producing an unscannable code', () => {
    expect(() =>
      assertScannableColours({ ...DEFAULT_STYLE, foreground: '#777777', background: '#888888' }),
    ).toThrow(QrContrastError);
  });

  it('rejects inverted polarity (light code on a dark background)', () => {
    expect(() =>
      assertScannableColours({ ...DEFAULT_STYLE, foreground: '#FFFFFF', background: '#000000' }),
    ).toThrow(QrContrastError);
  });

  it('rejects malformed colours', () => {
    expect(() =>
      assertScannableColours({ ...DEFAULT_STYLE, foreground: 'navy' }),
    ).toThrow(QrContrastError);
  });

  it('computes the standard contrast ratio', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });
});

describe('rendering', () => {
  it('renders a PNG that decodes back to the exact URL', async () => {
    const url = publicUrlForSlug(ORIGIN, 'sharma-salon');
    const png = await renderPng(url);
    await expect(verifyDecodes(png, url)).resolves.toBeUndefined();
  });

  it('renderVerifiedPng refuses to return a code that decodes to something else', async () => {
    const png = await renderPng(publicUrlForSlug(ORIGIN, 'shop-one'));
    await expect(verifyDecodes(png, publicUrlForSlug(ORIGIN, 'shop-two'))).rejects.toThrow(
      QrVerificationError,
    );
  });

  it('renders scalable SVG for banner-sized printing', async () => {
    const svg = await renderSvg(publicUrlForSlug(ORIGIN, 'sharma-salon'));
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox');
  });

  it('verifies the SVG banner download decodes back to the exact URL, same as the PNG', async () => {
    // Regression: the SVG download ("for banners") used to skip verification
    // entirely - a merchant could download and print an SVG that silently
    // failed to scan, with no check ever catching it.
    const url = publicUrlForSlug(ORIGIN, 'sharma-salon');
    const svg = await renderVerifiedSvg(url);
    expect(svg).toContain('<svg');
    await expect(verifyDecodes(svg, publicUrlForSlug(ORIGIN, 'a-different-shop'))).rejects.toThrow(
      QrVerificationError,
    );
  });

  it('renders a print-ready standee PDF containing the printed URL', async () => {
    const bytes = await renderStandeePdf({
      url: publicUrlForSlug(ORIGIN, 'sharma-salon'),
      businessName: 'Sharma Hair Salon',
    });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
  });

  it('a verified render survives every supported colour and size combination', async () => {
    const url = publicUrlForSlug(ORIGIN, 'a-longer-merchant-slug-here');
    for (const size of [256, 1024]) {
      for (const foreground of ['#000000', '#1A1A2E']) {
        const png = await renderVerifiedPng(url, { size, foreground, withLogo: true });
        expect(png.byteLength).toBeGreaterThan(0);
      }
    }
  });
});

describe('tokens', () => {
  it('excludes visually ambiguous characters', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateQrToken()).not.toMatch(/[01ilo]/);
    }
  });

  it('produces distinct tokens', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateQrToken()));
    expect(seen.size).toBe(500);
  });
});

describe('print guidance', () => {
  it('requires a larger minimum print size for longer URLs', () => {
    const short = minimumPrintSizeMm('https://ex.com/m/abc');
    const long = minimumPrintSizeMm(`https://ex.com/m/${'x'.repeat(60)}`);
    expect(long).toBeGreaterThan(short);
    expect(short).toBeGreaterThanOrEqual(19);
  });
});
