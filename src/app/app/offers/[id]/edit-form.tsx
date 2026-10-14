'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Button, ErrorText, Field, Input, Select, SuccessText, Textarea } from '@/components/ui';
import { updateOfferAction, type FormState } from '../../actions';

const initial: FormState = {};

export function EditOfferForm({
  offerId,
  photos,
  initial: values,
}: {
  offerId: string;
  photos: { id: string; altText: string | null }[];
  initial: {
    title: string;
    description: string;
    startsAt: string;
    endsAt: string;
    weekendOnly: boolean;
    couponCode: string;
    isPublished: boolean;
    mediaId: string;
  };
}) {
  const [state, action, pending] = useActionState(updateOfferAction.bind(null, offerId), initial);
  const [preset, setPreset] = useState('custom');

  return (
    <form action={action} className="card space-y-3 p-4">
      <ErrorText>{state.error}</ErrorText>
      <SuccessText>{state.success}</SuccessText>

      <Field label="Offer title">
        <Input name="title" required maxLength={120} defaultValue={values.title} />
      </Field>

      <Field label="Details" hint="Optional">
        <Textarea name="description" maxLength={1000} defaultValue={values.description} />
      </Field>

      <Field label="How long does it run?">
        <Select name="preset" value={preset} onChange={(e) => setPreset(e.target.value)}>
          <option value="today">Today only</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="custom">Choose dates</option>
        </Select>
      </Field>

      {preset === 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <Input name="startsAt" type="date" defaultValue={values.startsAt} />
          </Field>
          <Field label="Ends">
            <Input name="endsAt" type="date" defaultValue={values.endsAt} />
          </Field>
        </div>
      )}

      <label className="flex items-center gap-2 text-[14px]">
        <input type="checkbox" name="weekendOnly" defaultChecked={values.weekendOnly} className="h-5 w-5" />
        Weekends only
      </label>

      <Field label="Coupon code" hint="Optional">
        <Input name="couponCode" maxLength={40} defaultValue={values.couponCode} />
      </Field>

      <Field label="Photo" hint={photos.length === 0 ? undefined : 'Shown with this offer on your page'}>
        {photos.length === 0 ? (
          <p className="text-[13px] text-ink-500">
            No photos yet —{' '}
            <Link href="/app/profile" className="underline">
              add one in Shop details
            </Link>
            , then come back here to attach it.
          </p>
        ) : (
          <Select name="mediaId" defaultValue={values.mediaId}>
            <option value="">No photo</option>
            {photos.map((p, i) => (
              <option key={p.id} value={p.id}>
                {p.altText || `Photo ${i + 1}`}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <label className="flex items-center gap-2 text-[14px]">
        <input type="checkbox" name="isPublished" defaultChecked={values.isPublished} className="h-5 w-5" />
        Show this on my page
      </label>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Saving…' : 'Save changes'}
      </Button>

      <Link href="/app/offers" className="block text-center text-[14px] text-ink-500 underline">
        Back to offers
      </Link>
    </form>
  );
}
