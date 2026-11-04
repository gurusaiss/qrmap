'use client';

import { useTransition } from 'react';
import { Button, Card } from '@/components/ui';
import { publishAction, unpublishAction } from './actions';

/** Publishing is explicit: nothing is public until the merchant says so. */
export function PublishControls({ published }: { published: boolean }) {
  const [pending, start] = useTransition();

  return (
    <Card className="flex items-center justify-between gap-4">
      <div>
        <p className="font-semibold">{published ? 'Your page is live' : 'Your page is not published'}</p>
        <p className="mt-0.5 text-[14px] text-ink-500">
          {published
            ? 'Customers who scan your QR can see it now.'
            : 'People who scan your QR will see a “setting up” message.'}
        </p>
      </div>
      <Button
        variant={published ? 'secondary' : 'primary'}
        disabled={pending}
        onClick={() => start(() => void (published ? unpublishAction() : publishAction()))}
      >
        {published ? 'Unpublish' : 'Publish'}
      </Button>
    </Card>
  );
}
