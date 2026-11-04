/**
 * Pure helpers for the monthly WhatsApp report: no DB, no network.
 */
import type { MonthlyReport } from '../analytics';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The report sent during month M covers month M-1. */
export function reportPeriod(now: Date): { key: string; label: string } {
  const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1;
  return { key: `${year}-${String(month + 1).padStart(2, '0')}`, label: `${MONTHS[month]} ${year}` };
}

/**
 * Reports go out on the 1st-3rd of the month (the later days are only for
 * retrying failures) and only 10:00-21:00 IST, so nobody is messaged at night.
 * 04:30 UTC = 10:00 IST; 15:30 UTC = 21:00 IST.
 */
export function isReportWindow(now: Date): boolean {
  const day = now.getUTCDate();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return day >= 1 && day <= 3 && minutes >= 4 * 60 + 30 && minutes < 15 * 60 + 30;
}

/** "+91 98765-43211", "09876543211", "919876543211" -> "919876543211"; null if not a plausible number. */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** Shown in the dashboard so the number is recognisable without being fully displayed. */
export function maskNumber(digits: string): string {
  return `•••• ${digits.slice(-4)}`;
}

/** WhatsApp rejects newlines, tabs and 4+ consecutive spaces inside template parameters. */
export function sanitizeParam(value: string): string {
  const clean = value.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  return (clean === '' ? '-' : clean).slice(0, 300);
}

export function changeText(report: Pick<MonthlyReport, 'previous' | 'current' | 'changePercent'>): string {
  if (report.previous.scans === 0 && report.current.scans === 0) return 'still at zero';
  if (report.previous.scans === 0) return 'up from zero';
  if (report.changePercent > 0) return `up ${report.changePercent}%`;
  if (report.changePercent < 0) return `down ${Math.abs(report.changePercent)}%`;
  return 'the same';
}

export const FALLBACK_TIP = 'Keep your prices and offers up to date so customers always see the latest.';

/**
 * Positional body parameters for the approved template (order matters - it is
 * fixed by the template text in MANUAL-SETUP.md):
 *   {{1}} shop name  {{2}} month  {{3}} page opens  {{4}} customers who contacted
 *   {{5}} change vs the month before  {{6}} one tip
 */
export function reportTemplateParams(report: MonthlyReport, periodLabel: string): string[] {
  return [
    report.displayName,
    periodLabel,
    String(report.current.scans),
    String(report.current.leads),
    changeText(report),
    report.suggestion ?? FALLBACK_TIP,
  ].map(sanitizeParam);
}

/** What the template renders to - used for dry runs and the console driver so a human can proof-read it. */
export function renderReportPreview(params: string[]): string {
  const [shop, month, opens, leads, change, tip] = params;
  return `Hi! Here is your ${month} report for ${shop}: your page was opened ${opens} times and ${leads} customers contacted you. Page opens are ${change} compared with the month before. Tip: ${tip} Open your dashboard to see more.`;
}
