/**
 * Deterministic, non-AI parsing of a merchant's bulk catalog upload into
 * candidate rows. No model call anywhere in this file: a spreadsheet is
 * matched by column header text, a line of PDF/Word/OCR text is matched by a
 * fixed pattern ("name .... price"). Both are heuristics, not perfect, which
 * is why every row this produces is shown back to the merchant to review and
 * edit before anything is saved (see import/apply.ts) - never written to the
 * catalog unconfirmed.
 */
import { parseMoneyToMinor } from '../../core/money';

export type ParsedRow = {
  name: string;
  priceMinor: number | null;
  description: string | null;
  priceUnit: string | null;
  /** The original line/row text, shown back to the merchant for context. */
  raw: string;
};

export type ParseOutcome = {
  rows: ParsedRow[];
  /** Lines/rows that were skipped because no plausible product could be read from them. */
  skipped: number;
};

const NAME_HEADERS = ['name', 'item', 'product', 'service', 'item name', 'product name', 'title'];
const PRICE_HEADERS = ['price', 'rate', 'cost', 'amount', 'mrp', 'price (inr)', 'price(₹)', 'rs', 'rs.'];
const DESCRIPTION_HEADERS = ['description', 'details', 'desc', 'notes'];
const UNIT_HEADERS = ['unit', 'uom', 'per', 'per unit'];

function normalizeHeader(cell: unknown): string {
  return String(cell ?? '').trim().toLowerCase();
}

function findColumn(headerRow: unknown[], candidates: string[]): number {
  return headerRow.findIndex((cell) => candidates.includes(normalizeHeader(cell)));
}

function cellToString(cell: unknown): string {
  if (cell == null) return '';
  if (typeof cell === 'object' && 'text' in (cell as Record<string, unknown>)) {
    return String((cell as { text: unknown }).text ?? '').trim();
  }
  return String(cell).trim();
}

function cellToPriceMinor(cell: unknown): number | null {
  if (typeof cell === 'number') return Math.round(cell * 100);
  return parseMoneyToMinor(cellToString(cell));
}

/**
 * Spreadsheet rows (already read into a 2D array by import/extract.ts) into
 * candidate catalog items. Looks for a header row matching known column
 * names; if none is found, falls back to "first column is the name, first
 * numeric-looking column is the price" so a plain two-column list still
 * works.
 */
export function parseSpreadsheetRows(rows: unknown[][]): ParseOutcome {
  const nonEmpty = rows.filter((r) => r.some((c) => cellToString(c) !== ''));
  if (nonEmpty.length === 0) return { rows: [], skipped: 0 };

  let headerIndex = nonEmpty.findIndex((r) => findColumn(r, NAME_HEADERS) !== -1 && findColumn(r, PRICE_HEADERS) !== -1);
  let nameCol: number;
  let priceCol: number;
  let descCol: number;
  let unitCol: number;
  let dataRows: unknown[][];

  if (headerIndex !== -1) {
    const header = nonEmpty[headerIndex]!;
    nameCol = findColumn(header, NAME_HEADERS);
    priceCol = findColumn(header, PRICE_HEADERS);
    descCol = findColumn(header, DESCRIPTION_HEADERS);
    unitCol = findColumn(header, UNIT_HEADERS);
    dataRows = nonEmpty.slice(headerIndex + 1);
  } else {
    // No recognizable header: assume column 0 is the name, and use the
    // first column (other than 0) where most values look like a price.
    nameCol = 0;
    const colCount = Math.max(...nonEmpty.map((r) => r.length));
    let bestCol = -1;
    let bestScore = 0;
    for (let c = 1; c < colCount; c++) {
      const score = nonEmpty.filter((r) => cellToPriceMinor(r[c]) !== null).length;
      if (score > bestScore) {
        bestScore = score;
        bestCol = c;
      }
    }
    priceCol = bestCol;
    descCol = -1;
    unitCol = -1;
    dataRows = nonEmpty;
    headerIndex = -1;
  }

  const parsed: ParsedRow[] = [];
  let skipped = 0;
  for (const row of dataRows) {
    const name = cellToString(row[nameCol]);
    if (!name) {
      skipped++;
      continue;
    }
    const priceMinor = priceCol >= 0 ? cellToPriceMinor(row[priceCol]) : null;
    parsed.push({
      name,
      priceMinor,
      description: descCol >= 0 ? cellToString(row[descCol]) || null : null,
      priceUnit: unitCol >= 0 ? cellToString(row[unitCol]) || null : null,
      raw: row.map(cellToString).filter(Boolean).join(' · '),
    });
  }
  return { rows: parsed, skipped };
}

/**
 * Plain text (already extracted from a PDF/Word file, or OCR'd from an
 * image, by import/extract.ts) into candidate catalog items. Matches lines
 * shaped like a menu or price list: "item name .... 250" or
 * "Item name - Rs 250" - a name followed by a trailing price. A line with no
 * trailing price is skipped rather than guessed at.
 */
const PRICE_LINE = /^(.{1,160}?)[\s.:\-–—]{1,}\s*(?:rs\.?|inr|₹)?\s*([\d][\d,]*(?:\.\d{1,2})?)\s*(?:\/-|\/\s*(\S+))?$/i;

export function parseTextLines(text: string): ParseOutcome {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: ParsedRow[] = [];
  let skipped = 0;
  for (const line of lines) {
    const match = PRICE_LINE.exec(line);
    if (!match) {
      skipped++;
      continue;
    }
    const [, rawName, rawPrice, rawUnit] = match;
    const name = rawName!.replace(/[\s.\-–—]+$/, '').trim();
    const priceMinor = parseMoneyToMinor(rawPrice!.replace(/,/g, ''));
    if (!name || priceMinor === null) {
      skipped++;
      continue;
    }
    parsed.push({ name, priceMinor, description: null, priceUnit: rawUnit?.trim() || null, raw: line });
  }
  return { rows: parsed, skipped };
}
