import { describe, expect, it } from 'vitest';
import { buildCatalogShareText, whatsAppShareUrl } from '../share';

describe('buildCatalogShareText', () => {
  it('lists uncategorised items under the shop name with prices', () => {
    const text = buildCatalogShareText({
      displayName: 'Sharma Hair Salon',
      pageUrl: 'https://example.com/m/sharma-hair-salon',
      items: [
        { name: 'Haircut', priceMinor: 15000, priceMaxMinor: null, priceUnit: null, groupName: null },
        { name: 'Beard Oil', priceMinor: 25000, priceMaxMinor: null, priceUnit: null, groupName: null },
      ],
    });

    expect(text).toContain('*Sharma Hair Salon*');
    expect(text).toContain('• Haircut — ₹150');
    expect(text).toContain('• Beard Oil — ₹250');
    expect(text).toContain('https://example.com/m/sharma-hair-salon');
  });

  it('groups items under their category heading, preserving first-seen order', () => {
    const text = buildCatalogShareText({
      displayName: 'Krishna Hardware',
      pageUrl: 'https://example.com/m/krishna-hardware',
      items: [
        { name: 'PVC Pipe', priceMinor: 12000, priceMaxMinor: null, priceUnit: 'per length', groupName: 'Plumbing' },
        { name: 'Copper Wire', priceMinor: 185000, priceMaxMinor: null, priceUnit: null, groupName: 'Electrical' },
        { name: 'Elbow Joint', priceMinor: 3000, priceMaxMinor: null, priceUnit: null, groupName: 'Plumbing' },
      ],
    });

    const plumbingIdx = text.indexOf('*Plumbing*');
    const electricalIdx = text.indexOf('*Electrical*');
    const elbowIdx = text.indexOf('Elbow Joint');
    expect(plumbingIdx).toBeGreaterThan(-1);
    expect(electricalIdx).toBeGreaterThan(plumbingIdx);
    expect(elbowIdx).toBeGreaterThan(plumbingIdx);
  });

  it('renders a price range and "price on request" correctly', () => {
    const text = buildCatalogShareText({
      displayName: 'Shop',
      pageUrl: 'https://example.com/m/shop',
      items: [
        { name: 'Hair Colour', priceMinor: 60000, priceMaxMinor: 150000, priceUnit: null, groupName: null },
        { name: 'Custom Job', priceMinor: null, priceMaxMinor: null, priceUnit: null, groupName: null },
      ],
    });

    expect(text).toContain('₹600 – ₹1,500');
    expect(text).toContain('Price on request');
  });

  it('includes a published offer near the top, above the item list', () => {
    const text = buildCatalogShareText({
      displayName: 'Shop',
      pageUrl: 'https://example.com/m/shop',
      items: [{ name: 'Haircut', priceMinor: 15000, priceMaxMinor: null, priceUnit: null, groupName: null }],
      offer: { title: 'Festival Offer', description: '20% off everything' },
    });

    const offerIdx = text.indexOf('Festival Offer');
    const itemIdx = text.indexOf('Haircut');
    expect(offerIdx).toBeGreaterThan(-1);
    expect(offerIdx).toBeLessThan(itemIdx);
    expect(text).toContain('20% off everything');
  });

  it('caps the list and notes how many more items exist', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      name: `Item ${i + 1}`,
      priceMinor: 10000,
      priceMaxMinor: null,
      priceUnit: null,
      groupName: null,
    }));
    const text = buildCatalogShareText({ displayName: 'Shop', pageUrl: 'https://example.com/m/shop', items });

    expect(text).toContain('Item 25');
    expect(text).not.toContain('Item 26');
    expect(text).toContain('+ 5 more');
  });
});

describe('whatsAppShareUrl', () => {
  it('url-encodes the message into a wa.me link with no fixed recipient', () => {
    const url = whatsAppShareUrl('Hello & welcome\nLine two');
    expect(url).toBe('https://wa.me/?text=Hello%20%26%20welcome%0ALine%20two');
  });
});
