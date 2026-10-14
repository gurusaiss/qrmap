'use client';

import { useActionState, useState } from 'react';
import { Button, ErrorText, Field, Input, Select, SuccessText, Textarea } from '@/components/ui';
import { createOfferAction, type FormState } from '../actions';
import { DiscountFields } from './discount-fields';

const initial: FormState = {};

/**
 * Presets first, custom dates second: dates are the hardest input for this
 * user, so the common cases (today, this week, this month, weekends) are
 * one tap rather than two date pickers.
 */
export function OfferForm() {
  const [state, action, pending] = useActionState(createOfferAction, initial);
  const [preset, setPreset] = useState('today');

  // Remounting the form clears its uncontrolled inputs after a successful
  // create. Adjusting state during render (rather than in an effect) is the
  // React-documented pure way to do this: https://react.dev/learn/you-might-not-need-an-effect
  const [prevState, setPrevState] = useState(state);
  const [resetKey, setResetKey] = useState(0);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setResetKey((k) => k + 1);
  }

  return (
    <form action={action} key={resetKey} className="card space-y-3 p-4">
      <ErrorText>{state.error}</ErrorText>
      <SuccessText>{state.success}</SuccessText>

      <Field label="Offer title">
        <Input name="title" required maxLength={120} placeholder="Festival offer — ₹99 haircut" />
      </Field>

      <Field label="Details" hint="Optional">
        <Textarea name="description" maxLength={1000} />
      </Field>

      <DiscountFields />

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
            <Input name="startsAt" type="date" />
          </Field>
          <Field label="Ends">
            <Input name="endsAt" type="date" />
          </Field>
        </div>
      )}

      <label className="flex items-center gap-2 text-[14px]">
        <input type="checkbox" name="weekendOnly" className="h-5 w-5" />
        Weekends only
      </label>

      <Field label="Coupon code" hint="Optional">
        <Input name="couponCode" maxLength={40} />
      </Field>

      <Field label="Flyer image" hint="Optional — shown with this offer on your page">
        <input type="file" name="photo" accept="image/*" className="w-full text-[14px]" />
        <p className="mt-1 text-[12px] text-ink-400">Up to 12MB. JPG, PNG, WebP or AVIF.</p>
      </Field>

      <label className="flex items-center gap-2 text-[14px]">
        <input type="checkbox" name="isPublished" defaultChecked className="h-5 w-5" />
        Show this on my page now
      </label>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creating…' : 'Create offer'}
      </Button>
    </form>
  );
}
