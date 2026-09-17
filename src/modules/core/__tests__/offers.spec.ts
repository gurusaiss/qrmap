import { describe, expect, it } from 'vitest';
import { offerStatus, isPubliclyVisible, describeValidity, type OfferSchedule } from '../offers';

const IST = 'Asia/Kolkata';

function schedule(overrides: Partial<OfferSchedule> = {}): OfferSchedule {
  return {
    isPublished: true,
    startsAt: null,
    endsAt: null,
    dailyStartTime: null,
    dailyEndTime: null,
    activeWeekdays: null,
    ...overrides,
  };
}

/** 2026-09-16 is a Wednesday. 12:00 IST == 06:30 UTC. */
const wedNoonIST = new Date('2026-09-16T06:30:00Z');

describe('offerStatus', () => {
  it('is draft when unpublished, regardless of dates', () => {
    const o = schedule({ isPublished: false, startsAt: new Date('2000-01-01') });
    expect(offerStatus(o, wedNoonIST, IST)).toBe('draft');
  });

  it('is upcoming before the start date', () => {
    const o = schedule({ startsAt: new Date('2026-12-01T00:00:00Z') });
    expect(offerStatus(o, wedNoonIST, IST)).toBe('upcoming');
  });

  it('is expired after the end date', () => {
    const o = schedule({ endsAt: new Date('2026-01-01T00:00:00Z') });
    expect(offerStatus(o, wedNoonIST, IST)).toBe('expired');
  });

  it('is active inside an open-ended published window', () => {
    expect(offerStatus(schedule(), wedNoonIST, IST)).toBe('active');
  });

  it('expires the instant the end boundary passes', () => {
    const endsAt = new Date('2026-09-16T06:30:00Z');
    const justBefore = new Date(endsAt.getTime() - 1);
    expect(offerStatus(schedule({ endsAt }), justBefore, IST)).toBe('active');
    expect(offerStatus(schedule({ endsAt }), endsAt, IST)).toBe('expired');
  });

  describe('daily windows', () => {
    it('is active inside a happy hour and inactive outside it', () => {
      const o = schedule({ dailyStartTime: '16:00:00', dailyEndTime: '19:00:00' });
      const fivePmIST = new Date('2026-09-16T11:30:00Z');
      expect(offerStatus(o, fivePmIST, IST)).toBe('active');
      expect(offerStatus(o, wedNoonIST, IST)).toBe('inactive_now');
    });

    it('handles a window that crosses midnight', () => {
      const o = schedule({ dailyStartTime: '22:00:00', dailyEndTime: '02:00:00' });
      const elevenPmIST = new Date('2026-09-16T17:30:00Z');
      const oneAmIST = new Date('2026-09-16T19:30:00Z');
      const noon = wedNoonIST;
      expect(offerStatus(o, elevenPmIST, IST)).toBe('active');
      expect(offerStatus(o, oneAmIST, IST)).toBe('active');
      expect(offerStatus(o, noon, IST)).toBe('inactive_now');
    });
  });

  describe('weekday restrictions', () => {
    it('is inactive on an excluded weekday', () => {
      const weekendsOnly = schedule({ activeWeekdays: [0, 6] });
      expect(offerStatus(weekendsOnly, wedNoonIST, IST)).toBe('inactive_now');
    });

    it('is active on an included weekday', () => {
      const saturdayNoonIST = new Date('2026-09-19T06:30:00Z');
      const weekendsOnly = schedule({ activeWeekdays: [0, 6] });
      expect(offerStatus(weekendsOnly, saturdayNoonIST, IST)).toBe('active');
    });

    it('treats an empty weekday list as every day', () => {
      expect(offerStatus(schedule({ activeWeekdays: [] }), wedNoonIST, IST)).toBe('active');
    });
  });

  describe('timezone correctness', () => {
    it('evaluates the daily window in the shop timezone, not the server', () => {
      // 20:00 UTC is 01:30 next day in IST but still 13:00 in Los Angeles.
      const instant = new Date('2026-09-16T20:00:00Z');
      const lunchOffer = schedule({ dailyStartTime: '12:00:00', dailyEndTime: '15:00:00' });
      expect(offerStatus(lunchOffer, instant, 'America/Los_Angeles')).toBe('active');
      expect(offerStatus(lunchOffer, instant, IST)).toBe('inactive_now');
    });

    it('respects a DST transition in a zone that observes it', () => {
      // 2026-03-08 is the US spring-forward date.
      const beforeJump = new Date('2026-03-08T09:30:00Z'); // 01:30 PST
      const afterJump = new Date('2026-03-08T10:30:00Z'); // 03:30 PDT
      const earlyOffer = schedule({ dailyStartTime: '01:00:00', dailyEndTime: '02:00:00' });
      expect(offerStatus(earlyOffer, beforeJump, 'America/Los_Angeles')).toBe('active');
      expect(offerStatus(earlyOffer, afterJump, 'America/Los_Angeles')).toBe('inactive_now');
    });
  });

  it('never requires a cron job: status is a pure function of data and time', () => {
    const festival = schedule({
      startsAt: new Date('2026-10-01T00:00:00Z'),
      endsAt: new Date('2026-10-10T00:00:00Z'),
    });
    expect(offerStatus(festival, new Date('2026-09-30T23:59:59Z'), IST)).toBe('upcoming');
    expect(offerStatus(festival, new Date('2026-10-05T00:00:00Z'), IST)).toBe('active');
    // The day after it ends it is already expired with no job having run.
    expect(offerStatus(festival, new Date('2026-10-11T00:00:00Z'), IST)).toBe('expired');
  });
});

describe('isPubliclyVisible', () => {
  it('shows only active offers to customers', () => {
    expect(isPubliclyVisible('active')).toBe(true);
    for (const s of ['draft', 'upcoming', 'expired', 'inactive_now'] as const) {
      expect(isPubliclyVisible(s)).toBe(false);
    }
  });
});

describe('describeValidity', () => {
  it('describes each lifecycle state in merchant-facing language', () => {
    const ends = new Date('2026-09-20T00:00:00Z');
    expect(describeValidity(schedule({ endsAt: ends }), 'active')).toMatch(/Valid till/);
    expect(describeValidity(schedule({ endsAt: ends }), 'expired')).toMatch(/Ended/);
    expect(describeValidity(schedule(), 'active')).toBe('Ongoing offer');
  });
});
