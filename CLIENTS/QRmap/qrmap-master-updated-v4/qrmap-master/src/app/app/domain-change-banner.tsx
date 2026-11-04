'use client';

import { useTransition } from 'react';
import { Button, Card } from '@/components/ui';
import { acknowledgeDomainChangeAction } from './actions';

export function DomainChangeBanner() {
  const [pending, start] = useTransition();

  return (
    <Card className="border-warning-600/30 bg-warning-50/40">
      <h2 className="font-semibold">Your platform address changed</h2>
      <p className="mt-1 text-[14px] text-ink-700">
        Please download your QR code again from the QR page and print the new one — your old
        printed code may no longer work. Everything else about your page (prices, offers, photos)
        stays exactly as it was.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => start(() => acknowledgeDomainChangeAction())}
        >
          I&apos;ve reprinted my QR code
        </Button>
      </div>
    </Card>
  );
}
