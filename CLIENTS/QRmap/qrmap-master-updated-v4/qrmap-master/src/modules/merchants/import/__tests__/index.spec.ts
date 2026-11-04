import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { ImportFileError, parseImportFile } from '../index';

describe('parseImportFile (real file, end to end through the one public entry point)', () => {
  it('reads a real .xlsx workbook all the way to candidate catalog rows', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Menu');
    sheet.addRow(['Item', 'Price']);
    sheet.addRow(['Haircut', 150]);
    sheet.addRow(['Beard trim', 80]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await parseImportFile(buffer, 'menu.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(result.kind).toBe('spreadsheet');
    expect(result.skipped).toBe(0);
    expect(result.rows.map((r) => [r.name, r.priceMinor])).toEqual([
      ['Haircut', 15000],
      ['Beard trim', 8000],
    ]);
  });

  it('refuses an empty file', async () => {
    await expect(parseImportFile(Buffer.alloc(0), 'menu.xlsx', '')).rejects.toThrow(ImportFileError);
  });

  it('refuses a file larger than the 10 MB cap', async () => {
    const big = Buffer.alloc(11 * 1024 * 1024);
    await expect(parseImportFile(big, 'menu.xlsx', '')).rejects.toThrow('10 MB');
  });

  it('refuses an unsupported file type', async () => {
    await expect(parseImportFile(Buffer.from('whatever'), 'menu.exe', 'application/octet-stream')).rejects.toThrow(
      'Unsupported file type',
    );
  });
});
