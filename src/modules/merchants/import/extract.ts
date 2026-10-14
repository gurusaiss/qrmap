/**
 * Turns an uploaded file's raw bytes into either a 2D array of spreadsheet
 * cells or plain text, so parse.ts's deterministic matching can run on it.
 * No AI/model call anywhere here: spreadsheets are read as data, PDF/Word
 * text is extracted directly from the file, and images go through Tesseract
 * OCR - classical, local, pattern-recognition text extraction (not a
 * generative model, nothing sent to a third party).
 */
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export class ImportFileError extends Error {
  override readonly name = 'ImportFileError';
}

export type ImportFileKind = 'spreadsheet' | 'pdf' | 'docx' | 'image';

export function detectFileKind(filename: string, mimeType: string): ImportFileKind | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (['xlsx', 'xls', 'csv'].includes(ext) || mimeType.includes('spreadsheet') || mimeType === 'text/csv') {
    return 'spreadsheet';
  }
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (ext === 'docx' || mimeType.includes('wordprocessingml')) return 'docx';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext) || mimeType.startsWith('image/')) return 'image';
  return null;
}

/** A 2D array of cell values, first row(s) possibly a header - parse.ts decides which. */
export async function extractSpreadsheetRows(buffer: Buffer, filename: string): Promise<unknown[][]> {
  const workbook = new ExcelJS.Workbook();
  if (filename.toLowerCase().endsWith('.csv')) {
    await workbook.csv.read(Readable.from(buffer));
  } else {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ImportFileError('That file has no readable sheet.');

  const rows: unknown[][] = [];
  sheet.eachRow((row) => {
    // exceljs's row.values is 1-indexed with a leading empty slot.
    const values = (row.values as unknown[]).slice(1);
    rows.push(values);
  });
  return rows;
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * tesseract.js defaults to fetching its English model from jsdelivr at
 * worker-startup time, on every cold start, from code neither we nor the
 * deploy pipeline control - one external host being slow or unreachable and
 * OCR (and only OCR) breaks in production with no way to fix it short of a
 * new release. @tesseract.js-data/eng ships that exact model file as a
 * normal npm dependency, so pointing langPath at it makes this fully local:
 * no network call, no cold-start latency, works the same offline as online.
 */
const require = createRequire(import.meta.url);
// Resolved via package.json (a file type the bundler already understands),
// then joined to the known subfolder as a plain string - resolving the
// .gz itself directly makes Turbopack try to trace it in as a module and
// fail the build, regardless of serverExternalPackages.
const ENG_LANG_PATH = join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');

/**
 * OCR via Tesseract - the one step that cannot be made fully reliable: photo
 * quality, handwriting and busy layouts all degrade it. Every row OCR
 * produces still goes through the same merchant review step as the other
 * formats before anything is saved.
 */
export async function extractImageText(buffer: Buffer): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { langPath: ENG_LANG_PATH, cacheMethod: 'none', gzip: true });
  try {
    const { data } = await worker.recognize(buffer);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
