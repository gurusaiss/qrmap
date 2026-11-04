'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui';
import { setMonthlyReportAction } from './report-actions';

export function MonthlyReportSwitch({
  enabled,
  canChange,
  maskedNumber,
  lastSent,
}: {
  enabled: boolean;
  canChange: boolean;
  maskedNumber: string | null;
  lastSent: string | null;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="card mt-6 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{enabled ? 'Monthly report on WhatsApp is on' : 'Monthly report on WhatsApp'}</p>
          <p className="mt-0.5 text-[13px] text-ink-500">
            On the first days of each month we message you how many people opened your page and contacted you last month,
            with one tip.
          </p>
        </div>
        {canChange && (
          <Button
            variant="secondary"
            disabled={pending || (!enabled && !maskedNumber)}
            onClick={() => start(() => void setMonthlyReportAction(!enabled))}
          >
            {enabled ? 'Turn off' : 'Turn on'}
          </Button>
        )}
      </div>
      <p className="mt-2 text-[13px] text-ink-500">
        {maskedNumber ? (
          <>
            Sent to the number ending <strong>{maskedNumber.slice(-4)}</strong>.
          </>
        ) : (
          'We have no WhatsApp number for you yet. Add one under Shop details to turn this on.'
        )}
        {lastSent && <> Last report: {lastSent}.</>}
      </p>
    </div>
  );
}
