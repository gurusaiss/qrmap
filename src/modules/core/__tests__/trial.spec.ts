import { describe, expect, it } from 'vitest';
import { TRIAL_DAYS, trialStatus } from '../trial';

describe('trialStatus', () => {
  const signedUp = new Date('2024-01-01T00:00:00Z');

  it('is not expired on day zero, with the full trial remaining', () => {
    const status = trialStatus(signedUp, signedUp);
    expect(status.daysUsed).toBe(0);
    expect(status.daysLeft).toBe(TRIAL_DAYS);
    expect(status.expired).toBe(false);
  });

  it('counts down as days pass', () => {
    const oneDayIn = new Date(signedUp.getTime() + 25 * 60 * 60 * 1000);
    const status = trialStatus(signedUp, oneDayIn);
    expect(status.daysUsed).toBe(1);
    expect(status.daysLeft).toBe(TRIAL_DAYS - 1);
    expect(status.expired).toBe(false);
  });

  it('is expired exactly at the trial boundary, not one day late', () => {
    const atBoundary = new Date(signedUp.getTime() + TRIAL_DAYS * 86_400_000);
    const status = trialStatus(signedUp, atBoundary);
    expect(status.daysUsed).toBe(TRIAL_DAYS);
    expect(status.daysLeft).toBe(0);
    expect(status.expired).toBe(true);
  });

  it('never reports a negative days-left for a long-expired trial', () => {
    const wayLater = new Date(signedUp.getTime() + 90 * 86_400_000);
    const status = trialStatus(signedUp, wayLater);
    expect(status.daysLeft).toBe(0);
    expect(status.expired).toBe(true);
  });
});
