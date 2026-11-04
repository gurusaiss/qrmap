/**
 * Plain-text message builders for one-tap sharing (WhatsApp, SMS, etc).
 *
 * Pure text in, text out - no DB, no fetch - so it is fully unit-testable and
 * reusable from the dashboard (merchant shares to a customer) without caring
 * where the data came from.
 */
import { formatPriceRange } from './money';

export type ShareCatalogItem = {
  name: string;
  priceMinor: number | null;
  priceMaxMinor: number | null;
  priceUnit: string | null;
  groupName: string | null;
};

export type ShareOffer = {
  title: string;
  description: string | null;
} | null;

const MAX_ITEMS = 25;

/**
 * Builds a plain-text catalog message, grouped by category in the same order
 * items are passed in (uncategorised items last, under no heading).
 */
export function buildCatalogShareText(input: {
  displayName: string;
  pageUrl: string;
  items: ShareCatalogItem[];
  offer?: ShareOffer;
}): string {
  const lines: string[] = [`*${input.displayName}*`];

  if (input.offer) {
    lines.push('', `🎉 *${input.offer.title}*`);
    if (input.offer.description) lines.push(input.offer.description);
  }

  const groups = new Map<string, ShareCatalogItem[]>();
  for (const item of input.items.slice(0, MAX_ITEMS)) {
    const key = item.groupName ?? '';
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  for (const [groupName, items] of groups) {
    lines.push('', groupName ? `*${groupName}*` : '');
    for (const item of items) {
      const price = formatPriceRange(item.priceMinor, item.priceMaxMinor, item.priceUnit);
      lines.push(`• ${item.name} — ${price}`);
    }
  }

  if (input.items.length > MAX_ITEMS) {
    lines.push('', `+ ${input.items.length - MAX_ITEMS} more`);
  }

  lines.push('', input.pageUrl);

  // Collapse the accidental blank line left by an empty (uncategorised) group heading.
  return lines.filter((line, i) => line !== '' || lines[i - 1] !== '').join('\n');
}

/** A wa.me deep link that opens WhatsApp's chat picker with text pre-filled. */
export function whatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
