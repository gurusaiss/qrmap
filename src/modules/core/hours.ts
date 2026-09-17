/**
 * Opening-hours evaluation.
 *
 * Multiple rows per weekday support split shifts - the 1-4pm lunch close is
 * near-universal in Indian retail, so a single open/close pair per day would be
 * wrong for most of our market.
 *
 * Open/closed is never stored: a stored boolean is stale within the hour.
 */
import { formatMinutes, isWithinDailyWindow, minutesOfDay, parseTimeToMinutes, zonedDateString, zonedParts } from './time';

export type HoursRow = {
  dayOfWeek: number;
  opensAt: string | null;
  closesAt: string | null;
  isClosed: boolean;
};

export type Holiday = { date: string; label: string | null };

export type OpenState =
  | { open: true; closesAt: string; closingSoon: boolean }
  | { open: false; reason: 'closed_today' | 'holiday' | 'outside_hours'; opensNext: string | null; holidayLabel?: string };

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function dayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? '';
}

export function evaluateOpenState(
  rows: HoursRow[],
  holidays: Holiday[],
  now: Date,
  timeZone: string,
): OpenState {
  const parts = zonedParts(now, timeZone);
  const today = zonedDateString(now, timeZone);

  const holiday = holidays.find((h) => h.date === today);
  if (holiday) {
    return {
      open: false,
      reason: 'holiday',
      opensNext: nextOpening(rows, holidays, now, timeZone),
      ...(holiday.label ? { holidayLabel: holiday.label } : {}),
    };
  }

  const nowMinutes = minutesOfDay(now, timeZone);
  const todayRows = rows.filter((r) => r.dayOfWeek === parts.weekday && !r.isClosed);

  if (todayRows.length === 0) {
    return { open: false, reason: 'closed_today', opensNext: nextOpening(rows, holidays, now, timeZone) };
  }

  for (const row of todayRows) {
    const start = parseTimeToMinutes(row.opensAt);
    const end = parseTimeToMinutes(row.closesAt);
    if (start === null || end === null) continue;
    if (isWithinDailyWindow(nowMinutes, start, end)) {
      const minutesLeft = end > nowMinutes ? end - nowMinutes : 24 * 60 - nowMinutes + end;
      return { open: true, closesAt: formatMinutes(end), closingSoon: minutesLeft <= 60 };
    }
  }

  return { open: false, reason: 'outside_hours', opensNext: nextOpening(rows, holidays, now, timeZone) };
}

/** Human label for the next opening, e.g. "Opens 9:00 am" or "Opens Monday 9:00 am". */
function nextOpening(rows: HoursRow[], holidays: Holiday[], now: Date, timeZone: string): string | null {
  const parts = zonedParts(now, timeZone);
  const nowMinutes = minutesOfDay(now, timeZone);

  for (let offset = 0; offset < 8; offset++) {
    const weekday = (parts.weekday + offset) % 7;
    const dayDate = new Date(now.getTime() + offset * 86_400_000);
    if (holidays.some((h) => h.date === zonedDateString(dayDate, timeZone))) continue;

    const candidates = rows
      .filter((r) => r.dayOfWeek === weekday && !r.isClosed)
      .map((r) => parseTimeToMinutes(r.opensAt))
      .filter((m): m is number => m !== null)
      .filter((m) => offset > 0 || m > nowMinutes)
      .sort((a, b) => a - b);

    const next = candidates[0];
    if (next === undefined) continue;
    if (offset === 0) return `Opens ${formatMinutes(next)}`;
    if (offset === 1) return `Opens tomorrow ${formatMinutes(next)}`;
    return `Opens ${dayName(weekday)} ${formatMinutes(next)}`;
  }
  return null;
}

/** Groups rows for display: [{ day: 'Monday', windows: ['9:00 am – 1:00 pm', ...] }] */
export function formatWeek(rows: HoursRow[]): { day: string; dayOfWeek: number; windows: string[] }[] {
  return [1, 2, 3, 4, 5, 6, 0].map((dow) => {
    const dayRows = rows.filter((r) => r.dayOfWeek === dow && !r.isClosed);
    const windows = dayRows
      .map((r) => {
        const s = parseTimeToMinutes(r.opensAt);
        const e = parseTimeToMinutes(r.closesAt);
        return s !== null && e !== null ? `${formatMinutes(s)} – ${formatMinutes(e)}` : null;
      })
      .filter((w): w is string => w !== null);
    return { day: dayName(dow), dayOfWeek: dow, windows };
  });
}
