import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  INLINE_SCRIPT,
  INLINE_SCRIPT_CSP_HASH,
  esc,
  renderMerchantPageHtml,
  renderNotFoundHtml,
  renderStatusPageHtml,
} from '../render-html';
import type { PublicCatalogItem, PublicPageData } from '../public-page';

function catalogItem(overrides: Partial<PublicCatalogItem> & Pick<PublicCatalogItem, 'id' | 'name'>): PublicCatalogItem {
  return {
    kind: 'service',
    description: null,
    priceMinor: 10000,
    priceMaxMinor: null,
    priceUnit: null,
    compareAtMinor: null,
    durationMinutes: null,
    stockStatus: null,
    minOrderQty: null,
    bulkTiers: [],
    mediaId: null,
    photo: null,
    isFeatured: false,
    groupName: null,
    ...overrides,
  };
}

function baseData(overrides: Partial<PublicPageData> = {}): PublicPageData {
  return {
    tenantId: '11111111-1111-4111-8111-111111111111',
    slug: 'sharma-hair-salon',
    displayName: 'Sharma Hair Salon',
    templateKey: 'services',
    categoryName: 'Barber',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    profile: {
      tagline: 'Great haircuts',
      description: null,
      phone: '+919876543210',
      whatsapp: '+919876543210',
      email: null,
      websiteUrl: null,
      addressLine1: '12 Main Road',
      addressLine2: null,
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500035',
      googleMapsUrl: null,
      gbpReviewUrl: null,
      accentColor: '#1D4ED8',
      socials: {},
      logoMediaId: null,
      coverMediaId: null,
    },
    openState: { open: true, closesAt: '9:00 pm', closingSoon: false },
    week: [
      { day: 'Monday', dayOfWeek: 1, windows: ['9:00 am – 9:00 pm'] },
      { day: 'Sunday', dayOfWeek: 0, windows: [] },
    ],
    heroOffer: null,
    offers: [],
    services: [],
    products: [],
    gallery: [],
    aiEnabled: false,
    ...overrides,
  };
}

describe('esc', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(esc(`<script>alert("x")&'y'</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;y&#39;&lt;/script&gt;',
    );
  });
});

describe('renderMerchantPageHtml — security', () => {
  it('escapes a malicious business name rather than injecting it', () => {
    const html = renderMerchantPageHtml(
      baseData({ displayName: `<script>alert(1)</script>` }),
      'https://example.com',
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes merchant-supplied description and offer text', () => {
    const html = renderMerchantPageHtml(
      baseData({
        profile: { ...baseData().profile, description: `"><img src=x onerror=alert(1)>` },
        heroOffer: {
          id: 'o1',
          title: `</h2><script>evil()</script>`,
          description: null,
          terms: null,
          couponCode: null,
          discountType: 'custom',
          discountPercent: null,
          discountValueMinor: null,
          ctaType: 'none',
          ctaValue: null,
          mediaId: null,
          photo: null,
          status: 'active',
          isFeatured: true,
          validity: 'Ongoing offer',
        },
      }),
      'https://example.com',
    );
    expect(html).not.toContain('<img src=x onerror=');
    expect(html).not.toContain('<script>evil()</script>');
  });

  it('escapes malicious photo alt text', () => {
    const html = renderMerchantPageHtml(
      baseData({
        gallery: [{ id: 'm1', altText: `"><script>evil()</script>`, variants: { webp_800: 't/x/m1/800.webp' } }],
      }),
      'https://example.com',
    );
    expect(html).not.toContain('<script>evil()</script>');
  });

  it('escapes values placed inside href attributes', () => {
    const html = renderMerchantPageHtml(
      baseData({ profile: { ...baseData().profile, websiteUrl: `https://x.com/"><script>evil()</script>` } }),
      'https://example.com',
    );
    expect(html).not.toContain('<script>evil()</script>');
  });

  it('the JSON-LD block cannot be broken out of with an embedded </script>', () => {
    const html = renderMerchantPageHtml(
      baseData({ displayName: `Shop</script><script>alert(1)</script>` }),
      'https://example.com',
    );
    const ldJsonBlock = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '';
    expect(ldJsonBlock).not.toContain('</script>');
    expect(() => JSON.parse(ldJsonBlock)).not.toThrow();
  });
});

describe('renderMerchantPageHtml — content', () => {
  it('renders the business name, tagline and open state', () => {
    const html = renderMerchantPageHtml(baseData(), 'https://example.com');
    expect(html).toContain('Sharma Hair Salon');
    expect(html).toContain('Great haircuts');
    expect(html).toContain('Open now');
    expect(html).toContain('9:00 pm');
  });

  it('renders a catalog item\'s attached photo as a thumbnail, and renders fine without one', () => {
    const withPhoto = renderMerchantPageHtml(
      baseData({
        services: [
          {
            id: 's1',
            kind: 'service',
            name: 'Haircut',
            description: null,
            priceMinor: 15000,
            priceMaxMinor: null,
            priceUnit: null,
            compareAtMinor: null,
            durationMinutes: null,
            stockStatus: null,
            minOrderQty: null,
            bulkTiers: [],
            mediaId: 'm1',
            photo: { webp_400: 't/x/s1/400.webp' },
            isFeatured: false,
            groupName: null,
          },
        ],
      }),
      'https://example.com',
    );
    expect(withPhoto).toContain('class="catalog-thumb"');
    expect(withPhoto).toContain('/api/media/t/x/s1/400.webp');

    const withoutPhoto = renderMerchantPageHtml(
      baseData({
        services: [
          {
            id: 's2',
            kind: 'service',
            name: 'Shave',
            description: null,
            priceMinor: 5000,
            priceMaxMinor: null,
            priceUnit: null,
            compareAtMinor: null,
            durationMinutes: null,
            stockStatus: null,
            minOrderQty: null,
            bulkTiers: [],
            mediaId: null,
            photo: null,
            isFeatured: false,
            groupName: null,
          },
        ],
      }),
      'https://example.com',
    );
    expect(withoutPhoto).not.toContain('class="catalog-thumb"');
    expect(withoutPhoto).toContain('Shave');
  });

  describe('catalog categories', () => {
    it('renders one flat list, byte-identical to before categories existed, when nothing uses them', () => {
      const html = renderMerchantPageHtml(
        baseData({
          services: [
            catalogItem({ id: 's1', name: 'Haircut' }),
            catalogItem({ id: 's2', name: 'Shave' }),
          ],
        }),
        'https://example.com',
      );
      // The CSS rule for .catalog-group-heading is always present in the
      // stylesheet; what must NOT be present is the class actually applied.
      expect(html).not.toContain('class="catalog-group-heading"');
      expect(html.match(/<ul class="catalog-list">/g)?.length).toBe(1);
    });

    it('groups items under their category name when a merchant uses categories', () => {
      const html = renderMerchantPageHtml(
        baseData({
          services: [
            catalogItem({ id: 's1', name: 'Haircut', groupName: 'Hair' }),
            catalogItem({ id: 's2', name: 'Manicure', groupName: 'Nails' }),
            catalogItem({ id: 's3', name: 'Consultation' }),
          ],
        }),
        'https://example.com',
      );
      expect(html).toContain('class="catalog-group-heading">Hair<');
      expect(html).toContain('class="catalog-group-heading">Nails<');
      // Three categories (two named, one not) means three separate lists.
      expect(html.match(/<ul class="catalog-list">/g)?.length).toBe(3);
      const hairIndex = html.indexOf('Haircut');
      const nailsHeadingIndex = html.indexOf('class="catalog-group-heading">Nails');
      expect(hairIndex).toBeLessThan(nailsHeadingIndex);
    });
  });

  it("renders the current offer's attached photo as a thumbnail", () => {
    const html = renderMerchantPageHtml(
      baseData({
        heroOffer: {
          id: 'o1',
          title: 'Festival Offer',
          description: null,
          terms: null,
          couponCode: null,
          discountType: 'custom',
          discountPercent: null,
          discountValueMinor: null,
          ctaType: 'none',
          ctaValue: null,
          mediaId: 'm2',
          photo: { webp_400: 't/x/o1/400.webp' },
          status: 'active',
          isFeatured: true,
          validity: 'Ongoing offer',
        },
      }),
      'https://example.com',
    );
    expect(html).toContain('class="offer-thumb"');
    expect(html).toContain('/api/media/t/x/o1/400.webp');
  });

  it('renders uploaded photos as a gallery with avif/webp sources', () => {
    const html = renderMerchantPageHtml(
      baseData({
        gallery: [
          { id: 'm1', altText: 'Inside the salon', variants: { avif_800: 't/x/m1/800.avif', webp_800: 't/x/m1/800.webp' } },
          { id: 'm2', altText: null, variants: { webp_400: 't/x/m2/400.webp' } },
        ],
      }),
      'https://example.com',
    );
    expect(html).toContain('>Photos<');
    expect(html).toContain('/api/media/t/x/m1/800.avif');
    expect(html).toContain('/api/media/t/x/m1/800.webp');
    expect(html).toContain('alt="Inside the salon"');
    expect(html).toContain('/api/media/t/x/m2/400.webp');
  });

  it('omits the photos section entirely when there is no gallery media', () => {
    const html = renderMerchantPageHtml(baseData({ gallery: [] }), 'https://example.com');
    expect(html).not.toContain('>Photos<');
  });

  it('skips a gallery row that somehow has no usable variant, rather than rendering a broken image', () => {
    const html = renderMerchantPageHtml(
      baseData({ gallery: [{ id: 'm1', altText: null, variants: {} }] }),
      'https://example.com',
    );
    expect(html).not.toContain('>Photos<');
    expect(html).not.toContain('<img');
  });

  it('shows the hero photo when the merchant has uploaded one, and a monogram otherwise', () => {
    const withPhoto = renderMerchantPageHtml(
      baseData({ gallery: [{ id: 'm1', altText: null, variants: { webp_1600: 't/x/m1/1600.webp' } }] }),
      'https://example.com',
    );
    expect(withPhoto).toContain('class="hero-img"');
    expect(withPhoto).toContain('/api/media/t/x/m1/1600.webp');

    const withoutPhoto = renderMerchantPageHtml(baseData({ gallery: [] }), 'https://example.com');
    expect(withoutPhoto).not.toContain('class="hero-img"');
    expect(withoutPhoto).toContain('hero-monogram');
    expect(withoutPhoto).toContain('>S<'); // first letter of "Sharma Hair Salon"
  });

  it('never leaves a dead action-button cell: the row only ever holds the contact methods this merchant actually has', () => {
    const noAddress = { googleMapsUrl: null, addressLine1: null, addressLine2: null, city: null, state: null, pincode: null };
    const onlyCall = renderMerchantPageHtml(
      baseData({ profile: { ...baseData().profile, ...noAddress, whatsapp: null } }),
      'https://example.com',
    );
    expect(onlyCall.match(/class="btn /g)?.length).toBe(1);

    const none = renderMerchantPageHtml(
      baseData({ profile: { ...baseData().profile, ...noAddress, phone: null, whatsapp: null } }),
      'https://example.com',
    );
    expect(none).not.toContain('class="actions"');
  });

  it("highlights today's row in the opening-hours list, computed in the shop's own timezone", () => {
    // 2024-01-01 is a Monday.
    const monday = new Date('2024-01-01T12:00:00Z');
    const html = renderMerchantPageHtml(baseData(), 'https://example.com', monday);
    expect(html).toContain('hours-row is-today');
    expect(html).toContain('>Monday<span class="today-badge">Today</span><');

    const tuesday = new Date('2024-01-02T12:00:00Z');
    const htmlTuesday = renderMerchantPageHtml(baseData(), 'https://example.com', tuesday);
    // The CSS rule for .is-today is always present in the stylesheet; what
    // must NOT be present is the class actually applied to a row.
    expect(htmlTuesday).not.toContain('class="hours-row is-today"');
  });

  it('shows only ONE hero offer even when featured', () => {
    const html = renderMerchantPageHtml(
      baseData({
        heroOffer: {
          id: 'o1',
          title: 'Festival Offer',
          description: 'Big discount',
          terms: null,
          couponCode: 'FEST99',
          discountType: 'custom',
          discountPercent: null,
          discountValueMinor: null,
          ctaType: 'none',
          ctaValue: null,
          mediaId: null,
          photo: null,
          status: 'active',
          isFeatured: true,
          validity: 'Valid till 20 Sep',
        },
      }),
      'https://example.com',
    );
    expect(html.match(/Current offer/g)?.length).toBe(1);
    expect(html).toContain('FEST99');
  });

  it('shows the offer\'s own discount as a bold label, not just buried in free text', () => {
    const percentOff = renderMerchantPageHtml(
      baseData({
        heroOffer: {
          id: 'o1',
          title: 'Festival Offer',
          description: null,
          terms: null,
          couponCode: null,
          discountType: 'percent',
          discountPercent: 25,
          discountValueMinor: null,
          ctaType: 'none',
          ctaValue: null,
          mediaId: null,
          photo: null,
          status: 'active',
          isFeatured: true,
          validity: 'Ongoing offer',
        },
      }),
      'https://example.com',
    );
    expect(percentOff).toContain('25% off');

    const flatOff = renderMerchantPageHtml(
      baseData({
        heroOffer: {
          id: 'o2',
          title: 'Festival Offer',
          description: null,
          terms: null,
          couponCode: null,
          discountType: 'flat',
          discountPercent: null,
          discountValueMinor: 10000,
          ctaType: 'none',
          ctaValue: null,
          mediaId: null,
          photo: null,
          status: 'active',
          isFeatured: true,
          validity: 'Ongoing offer',
        },
      }),
      'https://example.com',
    );
    expect(flatOff).toContain('₹100');
    expect(flatOff).toContain('off');
  });

  it('renders call, whatsapp and directions as plain anchors requiring no JS', () => {
    const html = renderMerchantPageHtml(baseData(), 'https://example.com');
    expect(html).toContain('href="tel:+919876543210"');
    expect(html).toContain('https://wa.me/919876543210');
    expect(html).toContain('google.com/maps/search');
  });

  it('omits empty sections rather than rendering an empty heading', () => {
    const html = renderMerchantPageHtml(baseData(), 'https://example.com');
    expect(html).not.toContain('>Services<');
    expect(html).not.toContain('>Products<');
    expect(html).not.toContain('>More offers<');
  });

  it('includes the ask-assistant form only when AI is enabled for the tenant', () => {
    const disabled = renderMerchantPageHtml(baseData({ aiEnabled: false }), 'https://example.com');
    const enabled = renderMerchantPageHtml(baseData({ aiEnabled: true }), 'https://example.com');
    expect(disabled).not.toContain('id="ask-form"');
    expect(enabled).toContain('id="ask-form"');
  });

  it('renders opening hours for every day of the week', () => {
    const html = renderMerchantPageHtml(baseData(), 'https://example.com');
    expect(html).toContain('Monday');
    expect(html).toContain('Sunday');
    expect(html).toContain('Closed');
  });

  it('includes a canonical link and OG tags for SEO', () => {
    const html = renderMerchantPageHtml(baseData(), 'https://example.com');
    expect(html).toContain('rel="canonical" href="https://example.com/m/sharma-hair-salon"');
    expect(html).toContain('property="og:title"');
  });

  it('contains no framework script tags — only the one inline script this file writes', () => {
    const html = renderMerchantPageHtml(baseData(), 'https://example.com');
    const scriptTags = html.match(/<script(?![^>]*type="application\/ld\+json")[^>]*>/g) ?? [];
    expect(scriptTags.length).toBe(1);
  });

  it('carries the tenant id and slug as data attributes, not baked into the script text', () => {
    // The script text must be IDENTICAL across every merchant's page so it
    // can be allow-listed in CSP by a single fixed hash. Per-page values
    // belong in data-* attributes, read at runtime, never interpolated.
    const html = renderMerchantPageHtml(baseData(), 'https://example.com');
    expect(html).toContain('data-tenant-id="11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('data-slug="sharma-hair-salon"');

    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    expect(scriptMatch?.[1]).toBe(INLINE_SCRIPT);
    expect(scriptMatch?.[1]).not.toContain('sharma-hair-salon');
    expect(scriptMatch?.[1]).not.toContain('11111111-1111-4111-8111-111111111111');
  });

  it('the served inline script is byte-identical across two different merchants', () => {
    const htmlA = renderMerchantPageHtml(baseData(), 'https://example.com');
    const htmlB = renderMerchantPageHtml(
      baseData({ tenantId: '22222222-2222-4222-8222-222222222222', slug: 'a-totally-different-shop' }),
      'https://example.com',
    );
    const scriptOf = (html: string) => html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)?.[1];
    expect(scriptOf(htmlA)).toBe(scriptOf(htmlB));
  });

  describe('accent colour contrast', () => {
    // Regression: a merchant can type any hex colour into Shop details, with
    // no brightness restriction. --accent-ink used to be a hardcoded white
    // and --accent used to be printed directly as text colour - a merchant
    // who picked a pale colour (butter yellow, baby pink, near-white) got
    // invisible button/badge text and unreadable offer tags on their own
    // customer-facing page, with nothing ever catching it.
    function accentVars(html: string): { accent: string; accentInk: string; accentText: string } {
      const m = /style="--accent:(#[0-9a-f]{6});--accent-ink:(#[0-9a-f]{6});--accent-text:(#[0-9a-f]{6})"/i.exec(html);
      if (!m || !m[1] || !m[2] || !m[3]) throw new Error('accent style vars not found');
      return { accent: m[1], accentInk: m[2], accentText: m[3] };
    }

    function contrast(a: string, b: string): number {
      const parse = (hex: string) => {
        const n = parseInt(hex.slice(1), 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
      };
      const lum = (c: { r: number; g: number; b: number }) => {
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      };
      const la = lum(parse(a));
      const lb = lum(parse(b));
      const [hi, lo] = la > lb ? [la, lb] : [lb, la];
      return (hi + 0.05) / (lo + 0.05);
    }

    it('picks black ink, not a hardcoded white, for a pale merchant-chosen accent', () => {
      const html = renderMerchantPageHtml(
        baseData({ profile: { ...baseData().profile, accentColor: '#FFFACD' } }),
        'https://example.com',
      );
      const { accent, accentInk } = accentVars(html);
      expect(contrast(accent, accentInk)).toBeGreaterThanOrEqual(4.5);
    });

    it('darkens a pale accent before using it as text, instead of leaving it unreadable on the page background', () => {
      const html = renderMerchantPageHtml(
        baseData({ profile: { ...baseData().profile, accentColor: '#FFFACD' } }),
        'https://example.com',
      );
      const { accentText } = accentVars(html);
      expect(contrast(accentText, '#fdfbf6')).toBeGreaterThanOrEqual(4.5);
    });

    it('leaves a merchant-chosen colour that is already readable untouched', () => {
      const html = renderMerchantPageHtml(
        baseData({ profile: { ...baseData().profile, accentColor: '#1D4ED8' } }),
        'https://example.com',
      );
      const { accent, accentInk, accentText } = accentVars(html);
      expect(accent).toBe('#1d4ed8');
      expect(accentInk).toBe('#ffffff');
      expect(accentText).toBe('#1d4ed8');
    });

    it('still picks white ink for a dark accent', () => {
      const html = renderMerchantPageHtml(
        baseData({ profile: { ...baseData().profile, accentColor: '#1A1A2E' } }),
        'https://example.com',
      );
      const { accent, accentInk } = accentVars(html);
      expect(contrast(accent, accentInk)).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('hero / profile card seam', () => {
    // Regression: .profile-card overlaps the hero photo by a negative
    // top margin (it's meant to look like a card floating over the photo),
    // but it had no background at all. Because it paints after the hero in
    // document order, that transparent overlap still covered whatever was
    // underneath it - cutting the bottom of the photo and, since the shop
    // name's own bottom padding was smaller than the overlap, hiding part of
    // the merchant's own name on their customer-facing page.
    function cssRule(html: string, selector: string): string {
      const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = new RegExp(`${escaped}\\{([^}]*)\\}`).exec(style);
      if (!m || !m[1]) throw new Error(`rule ${selector} not found`);
      return m[1];
    }

    function pxValue(declarations: string, property: string, fallbackRem = 16): number {
      const m = new RegExp(`${property}:[^;]*?(-?[\\d.]+)(rem|px)`).exec(declarations);
      if (!m || !m[1] || !m[2]) throw new Error(`${property} not found in "${declarations}"`);
      const n = Number(m[1]);
      return m[2] === 'rem' ? n * fallbackRem : n;
    }

    it('gives the overlapping profile card an opaque background, so it never shows through to whatever is underneath', () => {
      const html = renderMerchantPageHtml(baseData(), 'https://example.com');
      const rule = cssRule(html, '.profile-card');
      expect(rule).toMatch(/background:/);
    });

    it('keeps the shop name clear of the profile card\'s overlap, however many lines it wraps to', () => {
      const html = renderMerchantPageHtml(baseData(), 'https://example.com');
      const cardMargin = pxValue(cssRule(html, '.profile-card'), 'margin');
      const heroNamePadding = cssRule(html, '.hero-name').match(/padding:([^;]+)/)?.[1] ?? '';
      // padding shorthand's last value is padding-bottom.
      const bottomPaddingToken = heroNamePadding.trim().split(/\s+/).pop() ?? '0';
      const bottomPaddingPx = bottomPaddingToken.endsWith('rem')
        ? Number(bottomPaddingToken.replace('rem', '')) * 16
        : Number(bottomPaddingToken.replace('px', ''));
      // cardMargin is negative (an upward pull); its magnitude is how much of
      // the hero the card overlaps.
      expect(bottomPaddingPx).toBeGreaterThanOrEqual(Math.abs(cardMargin));
    });
  });
});

describe('CSP hash', () => {
  it('INLINE_SCRIPT_CSP_HASH is the real SHA-256 hash of the exact script served', () => {
    const expected = `'sha256-${createHash('sha256').update(INLINE_SCRIPT).digest('base64')}'`;
    expect(INLINE_SCRIPT_CSP_HASH).toBe(expected);
  });

  it('the hash exported for use in CSP headers matches what is actually embedded in the page', () => {
    const html = renderMerchantPageHtml(baseData(), 'https://example.com');
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    const actualHash = `'sha256-${createHash('sha256').update(scriptMatch?.[1] ?? '').digest('base64')}'`;
    expect(actualHash).toBe(INLINE_SCRIPT_CSP_HASH);
  });
});

describe('status and not-found pages', () => {
  it('renders a branded coming-soon page, never a blank one', () => {
    const html = renderStatusPageHtml('coming_soon', 'New Shop');
    expect(html).toContain('New Shop is setting up');
    expect(html).toContain('noindex');
  });

  it('escapes the business name in status pages too', () => {
    const html = renderStatusPageHtml('suspended', `<script>x</script>`);
    expect(html).not.toContain('<script>x</script>');
  });

  it('renders a helpful not-found page with a way back home', () => {
    const html = renderNotFoundHtml();
    expect(html).toContain("couldn't find that business");
    expect(html).toContain('href="/"');
  });
});
