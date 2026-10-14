import { Card } from '@/components/ui';
import type { TrialStatus } from '@/modules/core/trial';

/**
 * No rupee amount ever appears here - pricing is a conversation with the
 * platform admin, not a number shown in the app.
 */
export function TrialBanner({ status }: { status: TrialStatus }) {
  if (status.expired) {
    return (
      <Card className="border-warning-600/30 bg-warning-50/40">
        <h2 className="font-semibold">Your free trial has ended</h2>
        <p className="mt-1 text-[14px] text-ink-700">
          Your page keeps working. For pricing and to continue, please contact your platform admin.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-[13px] font-medium uppercase tracking-wide text-ink-400">Free trial</p>
      <p className="mt-1 text-[15px] text-ink-700">
        {status.daysLeft === 0
          ? 'Your free trial ends today.'
          : `${status.daysLeft} day${status.daysLeft === 1 ? '' : 's'} left in your free trial.`}{' '}
        After that, contact your platform admin for pricing.
      </p>
    </Card>
  );
}
