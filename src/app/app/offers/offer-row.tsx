'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { Badge, Button } from '@/components/ui';
import { describeValidity, type OfferStatus } from '@/modules/core/offers';
import { formatMoney } from '@/modules/core/money';
import { deleteOfferAction, toggleOfferAction } from '../actions';

type Offer = {
  id: string;
  title: string;
  description: string | null;
  couponCode: string | null;
  discountType: 'percent' | 'flat' | 'bogo' | 'custom';
  discountValueMinor: number | null;
  discountPercent: number | null;
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

/** The offer's own "price" as one short label, e.g. "20% off" / "₹100 off". */
function discountLabel(offer: Offer): string | null {
  if (offer.discountType === 'percent' && offer.discountPercent != null) return `${offer.discountPercent}% off`;
  if (offer.discountType === 'flat' && offer.discountValueMinor != null) {
    return `${formatMoney(offer.discountValueMinor)} off`;
  }
  if (offer.discountType === 'bogo') return 'Buy one, get one';
  return null;
}

export function OfferRow({
  offer,
  status,
  photoUrl,
}: {
  offer: Offer;
  status: OfferStatus;
  photoUrl: string | null;
}) {
  const [pending, start] = useTransition();
  const discount = discountLabel(offer);

  return (
    <div className="card flex items-start gap-3 p-3">
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-[var(--radius-sm)] object-cover" />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-ink-100 text-ink-300">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-6 w-6">
            <path d="m11 3 6 6-7 7-6-6V4h7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M8 7h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-medium">{offer.title}</p>
          <Badge tone={TONE[status]}>{LABEL[status]}</Badge>
        </div>
        {discount && <p className="mt-0.5 text-[14px] font-semibold text-ink-900">{discount}</p>}
        {offer.description && <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-500">{offer.description}</p>}
        <p className="mt-0.5 text-[13px] text-ink-500">{describeValidity(offer, status)}</p>
        {offer.couponCode && (
          <p className="mt-1 inline-block rounded-[var(--radius-sm)] border border-dashed border-ink-300 px-2 py-0.5 font-mono text-[13px]">
            {offer.couponCode}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2">
          {status !== 'expired' && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => start(() => void toggleOfferAction(offer.id, !offer.isPublished))}
            >
              {offer.isPublished ? 'Unpublish' : 'Publish'}
            </Button>
          )}
          <Link
            href={`/app/offers/${offer.id}`}
            className="tap-target rounded-[var(--radius-sm)] px-3 text-[14px] font-medium text-ink-700 transition-colors hover:bg-ink-100"
          >
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
    </div>
  );
}
