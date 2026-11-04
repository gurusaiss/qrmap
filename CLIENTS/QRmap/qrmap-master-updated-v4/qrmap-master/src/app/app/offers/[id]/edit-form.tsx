'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Button, ErrorText, Field, Input, Select, SuccessText, Textarea } from '@/components/ui';
import { updateOfferAction, type FormState } from '../../actions';
import { DiscountFields } from '../discount-fields';

const initial: FormState = {};

export function EditOfferForm({
  offerId,
  currentPhotoUrl,
  initial: values,
}: {
  offerId: string;
  currentPhotoUrl: string | null;
  initial: {
    title: string;
    description: string;
    startsAt: string;
    endsAt: string;
    weekendOnly: boolean;
    couponCode: string;
    isPublished: boolean;
    discountType: 'percent' | 'flat' | 'bogo' | 'custom';
    discountValue: string;
    discountPercent: string;
  };
}) {
  const [state, action, pending] = useActionState(updateOfferAction.bind(null, offerId), initial);
  const [preset, setPreset] = useState('custom');
  const [removePhoto, setRemovePhoto] = useState(false);

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

      <DiscountFields
        defaultType={values.discountType}
        defaultValue={values.discountValue}
        defaultPercent={values.discountPercent}
      />

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

      <Field label="Flyer image" hint="Optional — shown with this offer on your page">
        {currentPhotoUrl && !removePhoto && (
          <div className="mb-2 flex items-center gap-3">
            <img src={currentPhotoUrl} alt="" className="h-16 w-16 rounded-[var(--radius-sm)] object-cover" />
            <label className="flex items-center gap-2 text-[13px] text-ink-500">
              <input
                type="checkbox"
                name="removePhoto"
                checked={removePhoto}
                onChange={(e) => setRemovePhoto(e.target.checked)}
                className="h-4 w-4"
              />
              Remove this photo
            </label>
          </div>
        )}
        <input type="file" name="photo" accept="image/*" className="w-full text-[14px]" />
        <p className="mt-1 text-[12px] text-ink-400">
          {currentPhotoUrl ? 'Choose a new file to replace it.' : 'Up to 12MB. JPG, PNG, WebP or AVIF.'}
        </p>
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
