'use client';

import { useTransition } from 'react';
import { Button, Card } from '@/components/ui';
import { recordDomainChangeAction } from '../actions';

export function DomainSection({ lastChangedAt }: { lastChangedAt: string | null }) {
  const [pending, start] = useTransition();

  return (
    <Card className="border-warning-600/30 bg-warning-50/40">
      <h2 className="font-semibold">Domain change notice</h2>
      <p className="mt-1 text-[13px] text-ink-500">
        Every printed QR code encodes today&apos;s <code className="font-mono">PUBLIC_QR_ORIGIN</code>.
        If you ever move to a new domain, click this so every merchant sees a reminder on their
        dashboard to reprint their QR code — their shop data itself needs nothing done to it, since
        the address change is just which domain prefixes the same slug.
      </p>
      <p className="mt-2 text-[13px] text-ink-700">
        {lastChangedAt
          ? `Last recorded: ${new Date(lastChangedAt).toLocaleString('en-IN')}`
          : 'No domain change has been recorded yet.'}
      </p>
      <Button
        variant="secondary"
        className="mt-3"
        disabled={pending}
        onClick={() => {
          if (confirm('This notifies every merchant to reprint their QR code. Only do this right after an actual domain change. Continue?')) {
            start(() => recordDomainChangeAction());
          }
        }}
      >
        Record a domain change now
      </Button>
    </Card>
  );
}
