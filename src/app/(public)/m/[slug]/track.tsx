'use client';

import { useEffect } from 'react';

/**
 * Analytics beacon. No cookies, no identifiers, no third-party script.
 *
 * Deliberately tiny and non-blocking: it uses sendBeacon and attaches a single
 * delegated listener rather than one per element, so it adds a negligible
 * amount to the page's JavaScript budget.
 */
export function TrackView({ tenantId }: { tenantId: string }) {
  useEffect(() => {
    const send = (eventType: string, extra: Record<string, string> = {}): void => {
      const body = JSON.stringify({
        tenantId,
        eventType,
        referrer: document.referrer || null,
        qr: new URLSearchParams(location.search).has('qr'),
        ...extra,
      });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/e', new Blob([body], { type: 'application/json' }));
        } else {
          void fetch('/api/e', { method: 'POST', body, keepalive: true });
        }
      } catch {
        /* analytics must never break the page */
      }
    };

    send('page_view');

    const onClick = (event: MouseEvent): void => {
      const target = (event.target as HTMLElement | null)?.closest('[data-track]');
      if (target instanceof HTMLElement) {
        const eventType = target.dataset.track;
        if (eventType) send(eventType);
      }
    };

    document.addEventListener('click', onClick, { passive: true });
    return () => document.removeEventListener('click', onClick);
  }, [tenantId]);

  return null;
}
