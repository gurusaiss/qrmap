'use client';

import { useState, useTransition } from 'react';
import { Badge, Button, ErrorText } from '@/components/ui';
import type { ReviewStatus } from '@/modules/reviews';
import { moderateReviewAction, replyToReviewAction } from './actions';

const TONE = { pending: 'warning', approved: 'success', hidden: 'neutral' } as const;
const LABEL = { pending: 'Waiting for you', approved: 'Showing on your page', hidden: 'Hidden' } as const;

export function ReviewRow({
  review,
  canModerate,
}: {
  review: { id: string; rating: number; authorName: string | null; comment: string | null; reply: string | null; status: ReviewStatus; createdAt: string };
  canModerate: boolean;
}) {
  const [pending, start] = useTransition();
  const set = (status: ReviewStatus) => start(() => void moderateReviewAction(review.id, status));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(review.reply ?? '');
  const [error, setError] = useState<string | undefined>();

  const saveReply = () =>
    start(async () => {
      const result = await replyToReviewAction(review.id, draft);
      setError(result.error);
      if (!result.error) setEditing(false);
    });

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">
          <span aria-label={`${review.rating} out of 5`}>
            {'★'.repeat(review.rating)}
            {'☆'.repeat(5 - review.rating)}
          </span>{' '}
          <span className="text-ink-500">· {review.authorName ?? 'A customer'}</span>
        </p>
        <Badge tone={TONE[review.status]}>{LABEL[review.status]}</Badge>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-400">{review.createdAt}</p>
      {review.comment && <p className="mt-2 whitespace-pre-line text-[15px]">{review.comment}</p>}
      {review.reply && !editing && (
        <div className="mt-3 rounded-[var(--radius-sm)] border-l-4 border-brand-700 bg-ink-50 p-3">
          <p className="text-[12px] font-semibold text-ink-500">Your reply</p>
          <p className="mt-0.5 whitespace-pre-line text-[14px]">{review.reply}</p>
        </div>
      )}
      {editing && (
        <div className="mt-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            rows={3}
            aria-label="Your reply"
            placeholder="Thank them, or answer a concern. This is shown publicly."
            className="w-full rounded-[var(--radius-sm)] border border-ink-200 bg-[var(--surface)] p-3 text-[15px]"
          />
          <ErrorText>{error}</ErrorText>
          <div className="flex items-center gap-2">
            <Button disabled={pending} onClick={saveReply}>
              {draft.trim() === '' ? 'Remove reply' : 'Save reply'}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setDraft(review.reply ?? '');
                setError(undefined);
              }}
            >
              Cancel
            </Button>
            <span className="ml-auto text-[12px] text-ink-400">{draft.length}/500</span>
          </div>
        </div>
      )}
      {canModerate && !editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          {review.status === 'approved' && (
            <Button variant="secondary" disabled={pending} onClick={() => setEditing(true)}>
              {review.reply ? 'Edit reply' : 'Reply'}
            </Button>
          )}
          {review.status !== 'approved' && (
            <Button disabled={pending} onClick={() => set('approved')}>
              Show on my page
            </Button>
          )}
          {review.status !== 'hidden' && (
            <Button variant="secondary" disabled={pending} onClick={() => set('hidden')}>
              Hide
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
