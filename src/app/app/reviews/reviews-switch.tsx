'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui';
import { setReviewsEnabledAction } from './actions';

export function ReviewsSwitch({ enabled, canChange }: { enabled: boolean; canChange: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="card mb-5 flex items-center justify-between gap-3 p-4">
      <div>
        <p className="font-medium">{enabled ? 'Reviews are on' : 'Reviews are off'}</p>
        <p className="text-[13px] text-ink-500">
          {enabled
            ? 'Customers can leave a review on your page.'
            : 'Your page shows no reviews and no review form. Existing reviews are kept.'}
        </p>
      </div>
      {canChange && (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => start(() => void setReviewsEnabledAction(!enabled))}
        >
          {enabled ? 'Turn off' : 'Turn on'}
        </Button>
      )}
    </div>
  );
}
