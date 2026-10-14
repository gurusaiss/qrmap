import { describe, expect, it } from 'vitest';
import { parseSpreadsheetRows, parseTextLines } from '../parse';

describe('parseSpreadsheetRows', () => {
  it('matches columns by header name, case-insensitively, in any order', () => {
    const rows = [
      ['Price', 'Item Name', 'Notes'],
      [150, 'Haircut', 'includes wash'],
      ['₹ 80', 'Beard trim', ''],
    ];
    const { rows: parsed, skipped } = parseSpreadsheetRows(rows);
    expect(skipped).toBe(0);
    expect(parsed).toEqual([
      { name: 'Haircut', priceMinor: 15000, description: 'includes wash', priceUnit: null, raw: '150 · Haircut · includes wash' },
      { name: 'Beard trim', priceMinor: 8000, description: null, priceUnit: null, raw: '₹ 80 · Beard trim' },
    ]);
  });

  it('falls back to "first column is name, first numeric column is price" when there is no recognizable header', () => {
    const rows = [
      ['Haircut', '150'],
      ['Beard trim', '80'],
      ['Head massage', '120'],
    ];
    const { rows: parsed, skipped } = parseSpreadsheetRows(rows);
    expect(skipped).toBe(0);
    expect(parsed.map((r) => [r.name, r.priceMinor])).toEqual([
      ['Haircut', 15000],
      ['Beard trim', 8000],
      ['Head massage', 12000],
    ]);
  });

  it('skips a row with no name rather than inventing one', () => {
    const rows = [
      ['Name', 'Price'],
      ['Haircut', '150'],
      ['', '80'],
    ];
    const { rows: parsed, skipped } = parseSpreadsheetRows(rows);
    expect(parsed).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('keeps a row with a name but no price, as "price on request"', () => {
    const rows = [
      ['Name', 'Price'],
      ['Call for pricing', ''],
    ];
    const { rows: parsed } = parseSpreadsheetRows(rows);
    expect(parsed).toEqual([{ name: 'Call for pricing', priceMinor: null, description: null, priceUnit: null, raw: 'Call for pricing' }]);
  });

  it('returns nothing for a completely empty sheet', () => {
    expect(parseSpreadsheetRows([])).toEqual({ rows: [], skipped: 0 });
    expect(parseSpreadsheetRows([[], ['', '']])).toEqual({ rows: [], skipped: 0 });
  });
});

describe('parseTextLines', () => {
  it('reads a simple "name .... price" menu line', () => {
    const { rows, skipped } = parseTextLines('Chicken Biryani .......... 250\nVeg Thali .... 120');
    expect(skipped).toBe(0);
    expect(rows.map((r) => [r.name, r.priceMinor])).toEqual([
      ['Chicken Biryani', 25000],
      ['Veg Thali', 12000],
    ]);
  });

  it('reads "name - Rs 250" and "name - ₹250" styles', () => {
    const { rows } = parseTextLines('Masala Dosa - Rs 80\nFiltered Coffee - ₹30');
    expect(rows.map((r) => [r.name, r.priceMinor])).toEqual([
      ['Masala Dosa', 8000],
      ['Filtered Coffee', 3000],
    ]);
  });

  it('reads a trailing unit like "/kg"', () => {
    const { rows } = parseTextLines('Basmati Rice - 120/kg');
    expect(rows[0]).toMatchObject({ name: 'Basmati Rice', priceMinor: 12000, priceUnit: 'kg' });
  });

  it('skips a heading or blank line with no trailing price', () => {
    const { rows, skipped } = parseTextLines('MAIN COURSE\n\nChicken Biryani .... 250');
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('skips a line that is only a price with no name', () => {
    const { rows, skipped } = parseTextLines('250\nChicken Biryani .... 250');
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('handles comma thousand-separators in the price', () => {
    const { rows } = parseTextLines('Wedding catering package - 15,000');
    expect(rows[0]?.priceMinor).toBe(1_500_000);
  });
});
