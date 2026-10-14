'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { Badge, Button } from '@/components/ui';
import { describeValidity, type OfferStatus } from '@/modules/core/offers';
import { deleteOfferAction, toggleOfferAction } from '../actions';

type Offer = {
  id: string;
  title: string;
  isPublished: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  dailyStartTime: string | null;
  dailyEndTime: string | null;
  activeWeekdays: number[] | null;
};

const TONE: Record<OfferStatus, 'success' | 'info' | 'neutral' | 'warning'> = {
  active: 'success',
  upcoming: 'info',
  draft: 'neutral',
  inactive_now: 'warning',
  expired: 'neutral',
};

const LABEL: Record<OfferStatus, string> = {
  active: 'Live now',
  upcoming: 'Starts soon',
  draft: 'Draft',
  inactive_now: 'Scheduled',
  expired: 'Ended',
};

export function OfferRow({ offer, status }: { offer: Offer; status: OfferStatus }) {
  const [pending, start] = useTransition();

  return (
    <div className="card flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{offer.title}</p>
        <p className="text-[13px] text-ink-500">{describeValidity(offer, status)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge tone={TONE[status]}>{LABEL[status]}</Badge>
        {status !== 'expired' && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => start(() => void toggleOfferAction(offer.id, !offer.isPublished))}
          >
            {offer.isPublished ? 'Unpublish' : 'Publish'}
          </Button>
        )}
        <Link href={`/app/offers/${offer.id}`} className="tap-target rounded-[var(--radius-sm)] px-3 text-[14px] font-medium text-ink-700 transition-colors hover:bg-ink-100">
          Edit
        </Link>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (confirm(`Delete "${offer.title}"?`)) start(() => void deleteOfferAction(offer.id));
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
