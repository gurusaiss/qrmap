import { describe, expect, it } from 'vitest';
import { evaluateOpenState, formatWeek, type HoursRow } from '../hours';

const IST = 'Asia/Kolkata';

/** Split shift: 09:00-13:00 and 16:00-21:00, the common Indian retail pattern. */
const splitShiftWeek: HoursRow[] = [1, 2, 3, 4, 5, 6].flatMap((dayOfWeek) => [
  { dayOfWeek, opensAt: '09:00:00', closesAt: '13:00:00', isClosed: false },
  { dayOfWeek, opensAt: '16:00:00', closesAt: '21:00:00', isClosed: false },
]);

describe('evaluateOpenState', () => {
  it('is open during the morning shift', () => {
    const tenAmIST = new Date('2026-09-16T04:30:00Z');
    const state = evaluateOpenState(splitShiftWeek, [], tenAmIST, IST);
    expect(state.open).toBe(true);
    if (state.open) expect(state.closesAt).toMatch(/1:00/);
  });

  it('is closed during the lunch break between shifts', () => {
    const twoThirtyPmIST = new Date('2026-09-16T09:00:00Z');
    const state = evaluateOpenState(splitShiftWeek, [], twoThirtyPmIST, IST);
    expect(state.open).toBe(false);
    if (!state.open) {
      expect(state.reason).toBe('outside_hours');
      expect(state.opensNext).toMatch(/Opens 4:00/);
    }
  });

  it('is open again during the evening shift', () => {
    const sixPmIST = new Date('2026-09-16T12:30:00Z');
    expect(evaluateOpenState(splitShiftWeek, [], sixPmIST, IST).open).toBe(true);
  });

  it('flags closing soon within the last hour', () => {
    const eightThirtyPmIST = new Date('2026-09-16T15:00:00Z');
    const state = evaluateOpenState(splitShiftWeek, [], eightThirtyPmIST, IST);
    expect(state.open).toBe(true);
    if (state.open) expect(state.closingSoon).toBe(true);
  });

  it('reports the weekly closed day and the next opening', () => {
    const sundayNoonIST = new Date('2026-09-20T06:30:00Z');
    const state = evaluateOpenState(splitShiftWeek, [], sundayNoonIST, IST);
    expect(state.open).toBe(false);
    if (!state.open) {
      expect(state.reason).toBe('closed_today');
      expect(state.opensNext).toMatch(/tomorrow/);
    }
  });

  it('honours a holiday override and skips it when finding the next opening', () => {
    const wedNoonIST = new Date('2026-09-16T06:30:00Z');
    const state = evaluateOpenState(
      splitShiftWeek,
      [{ date: '2026-09-16', label: 'Ganesh Chaturthi' }],
      wedNoonIST,
      IST,
    );
    expect(state.open).toBe(false);
    if (!state.open) {
      expect(state.reason).toBe('holiday');
      expect(state.holidayLabel).toBe('Ganesh Chaturthi');
      expect(state.opensNext).toMatch(/tomorrow/);
    }
  });

  it('evaluates in the shop timezone, not the server timezone', () => {
    // 04:30 UTC is 10:00 in IST (open) and 21:30 previous day in Los Angeles (closed).
    const instant = new Date('2026-09-16T04:30:00Z');
    expect(evaluateOpenState(splitShiftWeek, [], instant, IST).open).toBe(true);
    expect(evaluateOpenState(splitShiftWeek, [], instant, 'America/Los_Angeles').open).toBe(false);
  });

  it('handles a late-night shop whose hours cross midnight', () => {
    const lateNight: HoursRow[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      opensAt: '18:00:00',
      closesAt: '02:00:00',
      isClosed: false,
    }));
    const oneAmWedIST = new Date('2026-09-16T19:30:00Z'); // 01:00 Thu IST
    expect(evaluateOpenState(lateNight, [], oneAmWedIST, IST).open).toBe(true);
  });

  it('returns closed rather than throwing when no hours are configured', () => {
    const state = evaluateOpenState([], [], new Date(), IST);
    expect(state.open).toBe(false);
    if (!state.open) expect(state.opensNext).toBeNull();
  });
});

describe('formatWeek', () => {
  it('starts the week on Monday and groups split shifts together', () => {
    const week = formatWeek(splitShiftWeek);
    expect(week[0]?.day).toBe('Monday');
    expect(week[6]?.day).toBe('Sunday');
    expect(week[0]?.windows).toHaveLength(2);
    expect(week[6]?.windows).toHaveLength(0);
  });
});
