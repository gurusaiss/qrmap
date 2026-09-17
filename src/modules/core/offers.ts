/**
 * Offer lifecycle.
 *
 * Status is COMPUTED, never stored (decision D14). A cron job that flips an
 * `is_active` column has a failure mode where a festival offer stays live for a
 * week after it ended, leaving the merchant's page actively wrong - worse than
 * empty. A derived status cannot drift and has no job to fail.
 */
import { isWithinDailyWindow, minutesOfDay, parseTimeToMinutes, zonedParts } from './time';

export type OfferStatus = 'draft' | 'upcoming' | 'active' | 'inactive_now' | 'expired';

export type OfferSchedule = {
  isPublished: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  dailyStartTime: string | null;
  dailyEndTime: string | null;
  /** 0 = Sunday ... 6 = Saturday. Empty or null means every day. */
  activeWeekdays: number[] | null;
};

export function offerStatus(offer: OfferSchedule, now: Date, timeZone: string): OfferStatus {
  if (!offer.isPublished) return 'draft';
  if (offer.startsAt && now < offer.startsAt) return 'upcoming';
  if (offer.endsAt && now >= offer.endsAt) return 'expired';

  const parts = zonedParts(now, timeZone);

  if (offer.activeWeekdays && offer.activeWeekdays.length > 0) {
    if (!offer.activeWeekdays.includes(parts.weekday)) return 'inactive_now';
  }

  const start = parseTimeToMinutes(offer.dailyStartTime);
  const end = parseTimeToMinutes(offer.dailyEndTime);
  if (start !== null && end !== null) {
    const nowMinutes = minutesOfDay(now, timeZone);
    if (!isWithinDailyWindow(nowMinutes, start, end)) return 'inactive_now';
  }

  return 'active';
}

/** Shown on the public page. `inactive_now` offers are hidden, not expired. */
export function isPubliclyVisible(status: OfferStatus): boolean {
  return status === 'active';
}

/** Kept in the dashboard's "Ended" section so a festival offer can be reused. */
export function isArchived(status: OfferStatus): boolean {
  return status === 'expired';
}

export function describeValidity(
  offer: OfferSchedule,
  status: OfferStatus,
  locale = 'en-IN',
): string {
  const fmt = (d: Date): string =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(d);

  if (status === 'expired') return offer.endsAt ? `Ended ${fmt(offer.endsAt)}` : 'Ended';
  if (status === 'upcoming') return offer.startsAt ? `Starts ${fmt(offer.startsAt)}` : 'Starting soon';
  if (offer.endsAt) return `Valid till ${fmt(offer.endsAt)}`;
  return 'Ongoing offer';
}
