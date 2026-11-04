/**
 * Trial messaging. There is no billing integration yet (no payment gateway is
 * wired up), so this is informational only - it tells a merchant where they
 * stand, never blocks or disables anything. No rupee amount is ever shown
 * here or anywhere a merchant can see: pricing is a conversation with the
 * platform admin, not a number printed in the app.
 */
export const TRIAL_DAYS = 3;

export type TrialStatus = { daysUsed: number; daysLeft: number; expired: boolean };

export function trialStatus(createdAt: Date, now: Date = new Date()): TrialStatus {
  const daysUsed = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000));
  const daysLeft = Math.max(0, TRIAL_DAYS - daysUsed);
  return { daysUsed, daysLeft, expired: daysUsed >= TRIAL_DAYS };
}
