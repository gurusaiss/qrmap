import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { detectFileKind, extractDocxText, extractImageText, extractPdfText, extractSpreadsheetRows } from '../extract';

describe('detectFileKind', () => {
  it('detects by file extension', () => {
    expect(detectFileKind('menu.xlsx', '')).toBe('spreadsheet');
    expect(detectFileKind('menu.csv', '')).toBe('spreadsheet');
    expect(detectFileKind('menu.pdf', '')).toBe('pdf');
    expect(detectFileKind('menu.docx', '')).toBe('docx');
    expect(detectFileKind('menu.jpg', '')).toBe('image');
  });

  it('falls back to MIME type when the extension is missing or wrong', () => {
    expect(detectFileKind('upload', 'application/pdf')).toBe('pdf');
    expect(detectFileKind('upload', 'image/png')).toBe('image');
  });

  it('returns null for an unsupported file', () => {
    expect(detectFileKind('menu.exe', 'application/octet-stream')).toBeNull();
  });
});

describe('extractSpreadsheetRows (real exceljs round-trip, not a mock)', () => {
  it('reads back exactly what was written to a real .xlsx workbook', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Menu');
    sheet.addRow(['Name', 'Price']);
    sheet.addRow(['Haircut', 150]);
    sheet.addRow(['Beard trim', 80]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const rows = await extractSpreadsheetRows(buffer, 'menu.xlsx');
    expect(rows).toEqual([
      ['Name', 'Price'],
      ['Haircut', 150],
      ['Beard trim', 80],
    ]);
  });

  it('reads a real CSV buffer the same way (exceljs infers numeric cells as numbers)', async () => {
    const csv = 'Name,Price\nHaircut,150\nBeard trim,80\n';
    const rows = await extractSpreadsheetRows(Buffer.from(csv, 'utf8'), 'menu.csv');
    expect(rows).toEqual([
      ['Name', 'Price'],
      ['Haircut', 150],
      ['Beard trim', 80],
    ]);
  });
});

describe('extractPdfText (real pdf-parse, not a mock)', () => {
  it('reads back text from a real, freshly-generated PDF', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Haircut - Rs 150', { x: 20, y: 150, size: 14, font });
    page.drawText('Beard trim - Rs 80', { x: 20, y: 120, size: 14, font });
    const buffer = Buffer.from(await doc.save());

    const text = await extractPdfText(buffer);
    expect(text).toContain('Haircut - Rs 150');
    expect(text).toContain('Beard trim - Rs 80');
  });
});

describe('extractDocxText (real mammoth, not a mock)', () => {
  it('reads back text from a real, minimal .docx package', async () => {
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>',
    );
    zip.file(
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    );
    zip.file(
      'word/document.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:body>' +
        '<w:p><w:r><w:t>Haircut - Rs 150</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Beard trim - Rs 80</w:t></w:r></w:p>' +
        '</w:body></w:document>',
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const text = await extractDocxText(buffer);
    expect(text).toContain('Haircut - Rs 150');
    expect(text).toContain('Beard trim - Rs 80');
  });
});

describe('extractImageText (real Tesseract OCR, not a mock)', () => {
  it(
    'runs fully offline - no network call to fetch language data (regression: tesseract.js defaults to a jsdelivr CDN fetch at startup)',
    async () => {
      const blank = await sharp({ create: { width: 200, height: 60, channels: 3, background: 'white' } })
        .png()
        .toBuffer();
      // The real assertion is that this resolves at all: with the default
      // (CDN) langPath, this call fails with "fetch failed" in any sandboxed
      // or offline environment, before it ever gets to recognizing pixels.
      const text = await extractImageText(blank);
      expect(typeof text).toBe('string');
    },
    30_000,
  );
});
