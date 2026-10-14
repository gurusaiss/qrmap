import {
  detectFileKind,
  extractDocxText,
  extractImageText,
  extractPdfText,
  extractSpreadsheetRows,
  ImportFileError,
  MAX_IMPORT_BYTES,
} from './extract';
import { parseSpreadsheetRows, parseTextLines, type ParsedRow } from './parse';

export { ImportFileError, MAX_IMPORT_BYTES } from './extract';
export type { ParsedRow } from './parse';

export type ImportOutcome = {
  rows: ParsedRow[];
  skipped: number;
  kind: 'spreadsheet' | 'pdf' | 'docx' | 'image';
};

/**
 * One entry point for every supported upload format. Dispatches to the
 * right extractor (extract.ts), then the right deterministic matcher
 * (parse.ts) - no AI/model call anywhere in this path.
 */
export async function parseImportFile(buffer: Buffer, filename: string, mimeType: string): Promise<ImportOutcome> {
  if (buffer.byteLength === 0) throw new ImportFileError('The file is empty.');
  if (buffer.byteLength > MAX_IMPORT_BYTES) throw new ImportFileError('Files must be 10 MB or smaller.');

  const kind = detectFileKind(filename, mimeType);
  if (!kind) {
    throw new ImportFileError(
      'Unsupported file type. Upload an Excel or CSV file, a PDF, a Word document, or a clear photo of your price list.',
    );
  }

  if (kind === 'spreadsheet') {
    const rows = await extractSpreadsheetRows(buffer, filename);
    const outcome = parseSpreadsheetRows(rows);
    return { ...outcome, kind };
  }

  const text =
    kind === 'pdf' ? await extractPdfText(buffer) : kind === 'docx' ? await extractDocxText(buffer) : await extractImageText(buffer);
  const outcome = parseTextLines(text);
  return { ...outcome, kind };
}
