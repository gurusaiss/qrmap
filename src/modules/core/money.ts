/**
 * Money is always integer minor units (paise). Never floats, never numeric -
 * integer arithmetic removes an entire class of rounding bug.
 */

export type Currency = 'INR';

export function formatMoney(minor: number, currency: Currency = 'INR', locale = 'en-IN'): string {
  const major = minor / 100;
  const hasPaise = minor % 100 !== 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  }).format(major);
}

/** "₹150" | "₹150 – ₹400" | "Price on request" | "₹80 per kg" */
export function formatPriceRange(
  priceMinor: number | null | undefined,
  priceMaxMinor: number | null | undefined,
  unit: string | null | undefined,
  currency: Currency = 'INR',
): string {
  if (priceMinor == null && priceMaxMinor == null) return 'Price on request';
  const base =
    priceMinor != null && priceMaxMinor != null && priceMaxMinor > priceMinor
      ? `${formatMoney(priceMinor, currency)} – ${formatMoney(priceMaxMinor, currency)}`
      : formatMoney((priceMinor ?? priceMaxMinor) as number, currency);
  return unit ? `${base} ${unit}` : base;
}

/** Parses user input like "150", "₹150", "1,500.50" into paise. */
export function parseMoneyToMinor(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '').trim();
  if (cleaned === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function discountedPriceMinor(
  priceMinor: number,
  discount: { type: 'percent' | 'flat'; percent?: number | null; valueMinor?: number | null },
): number {
  if (discount.type === 'percent' && discount.percent != null) {
    return Math.max(0, Math.round(priceMinor * (1 - discount.percent / 100)));
  }
  if (discount.type === 'flat' && discount.valueMinor != null) {
    return Math.max(0, priceMinor - discount.valueMinor);
  }
  return priceMinor;
}
