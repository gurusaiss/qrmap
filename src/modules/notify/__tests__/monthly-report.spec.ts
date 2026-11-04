import { describe, expect, it } from 'vitest';
import type { MonthlyReport } from '../../analytics';
import {
  changeText,
  FALLBACK_TIP,
  isReportWindow,
  maskNumber,
  normalizeWhatsAppNumber,
  renderReportPreview,
  reportPeriod,
  reportTemplateParams,
  sanitizeParam,
} from '../monthly-report';

const summary = (scans: number, leads = 0) => ({
  scans, uniqueVisitors: scans, leads, calls: 0, whatsapp: 0, directions: 0, offerClicks: 0,
});

function report(over: Partial<MonthlyReport> = {}): MonthlyReport {
  return {
    tenantId: 't',
    displayName: 'Sharma Hair Salon',
    period: 'x',
    current: summary(120, 14),
    previous: summary(100),
    changePercent: 20,
    suggestion: 'Post an offer.',
    ...over,
  };
}

describe('reportPeriod', () => {
  it('is the previous calendar month', () => {
    expect(reportPeriod(new Date('2026-11-02T06:00:00Z'))).toEqual({ key: '2026-10', label: 'October 2026' });
    expect(reportPeriod(new Date('2026-03-01T06:00:00Z'))).toEqual({ key: '2026-02', label: 'February 2026' });
  });

  it('rolls back across the year boundary', () => {
    expect(reportPeriod(new Date('2027-01-02T06:00:00Z'))).toEqual({ key: '2026-12', label: 'December 2026' });
  });
});

describe('isReportWindow', () => {
  it('is open on days 1-3, between 10:00 and 21:00 IST', () => {
    expect(isReportWindow(new Date('2026-11-01T04:30:00Z'))).toBe(true); // 10:00 IST
    expect(isReportWindow(new Date('2026-11-03T15:29:00Z'))).toBe(true); // 20:59 IST
  });

  it('is closed at night, before 10:00 IST and from 21:00 IST', () => {
    expect(isReportWindow(new Date('2026-11-01T04:29:00Z'))).toBe(false);
    expect(isReportWindow(new Date('2026-11-01T15:30:00Z'))).toBe(false);
    expect(isReportWindow(new Date('2026-11-02T21:00:00Z'))).toBe(false);
  });

  it('is closed for the rest of the month', () => {
    for (const day of ['04', '15', '28', '30']) {
      expect(isReportWindow(new Date(`2026-11-${day}T08:00:00Z`))).toBe(false);
    }
  });
});

describe('normalizeWhatsAppNumber', () => {
  it.each([
    ['+91 98765-43211', '919876543211'],
    ['9876543211', '919876543211'],
    ['09876543211', '919876543211'],
    ['919876543211', '919876543211'],
    ['+1 (415) 555-2671', '14155552671'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeWhatsAppNumber(input)).toBe(expected);
  });

  it.each([null, undefined, '', 'abc', '12345', '+91 12', '1'.repeat(16)])('rejects %s', (input) => {
    expect(normalizeWhatsAppNumber(input as string | null)).toBeNull();
  });
});

describe('maskNumber', () => {
  it('shows only the last four digits', () => {
    expect(maskNumber('919876543211')).toBe('•••• 3211');
  });
});

describe('sanitizeParam', () => {
  it('removes newlines, tabs and runs of spaces, which WhatsApp rejects in parameters', () => {
    expect(sanitizeParam('a\nb\t\tc    d')).toBe('a b c d');
  });

  it('never returns an empty parameter (WhatsApp rejects those) and caps the length', () => {
    expect(sanitizeParam('   ')).toBe('-');
    expect(sanitizeParam('x'.repeat(1000))).toHaveLength(300);
  });
});

describe('changeText', () => {
  it('describes up, down, flat and first-month cases', () => {
    expect(changeText(report({ changePercent: 20 }))).toBe('up 20%');
    expect(changeText(report({ changePercent: -35 }))).toBe('down 35%');
    expect(changeText(report({ changePercent: 0 }))).toBe('the same');
    expect(changeText(report({ previous: summary(0), current: summary(50), changePercent: 100 }))).toBe('up from zero');
    expect(changeText(report({ previous: summary(0), current: summary(0), changePercent: 0 }))).toBe('still at zero');
  });
});

describe('reportTemplateParams', () => {
  it('returns the six template parameters in template order', () => {
    expect(reportTemplateParams(report(), 'October 2026')).toEqual([
      'Sharma Hair Salon', 'October 2026', '120', '14', 'up 20%', 'Post an offer.',
    ]);
  });

  it('falls back to a generic tip when there is no suggestion', () => {
    expect(reportTemplateParams(report({ suggestion: null }), 'October 2026')[5]).toBe(FALLBACK_TIP);
  });

  it("cleans a merchant-controlled shop name so it cannot break the template", () => {
    const params = reportTemplateParams(report({ displayName: 'Shop\nwith    gaps' }), 'October 2026');
    expect(params[0]).toBe('Shop with gaps');
  });

  it('renders a readable preview for proof-reading', () => {
    const text = renderReportPreview(reportTemplateParams(report(), 'October 2026'));
    expect(text).toContain('October 2026 report for Sharma Hair Salon');
    expect(text).toContain('opened 120 times and 14 customers contacted you');
    expect(text).toContain('up 20% compared with the month before');
  });

  it.each([
    [report({ changePercent: -35 }), 'Page opens are down 35% compared with the month before.'],
    [report({ previous: summary(0), current: summary(50), changePercent: 100 }), 'Page opens are up from zero compared with the month before.'],
    [report({ previous: summary(0), current: summary(0), changePercent: 0 }), 'Page opens are still at zero compared with the month before.'],
  ])('reads as a sentence in every case', (r, sentence) => {
    expect(renderReportPreview(reportTemplateParams(r, 'October 2026'))).toContain(sentence);
  });
});
