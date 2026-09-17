'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui';

/**
 * Global error boundary for the React-rendered surfaces (dashboard, admin,
 * login). Never a raw stack trace or a blank white screen: the merchant sees
 * what happened in plain words and a way to recover.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // In production this is where Sentry (or another error monitor) would
    // capture the event - see docs/12-KNOWN-ISSUES.md and MANUAL-SETUP.md for
    // wiring instructions. Logged here so failures are visible in server logs
    // even before that is connected.
    console.error('Unhandled error', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-[18px] font-semibold">Something went wrong</h1>
      <p className="mt-2 text-[15px] text-ink-500">
        This wasn&apos;t your fault. Please try again, and contact support if it keeps happening.
      </p>
      <Button className="mt-5" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
