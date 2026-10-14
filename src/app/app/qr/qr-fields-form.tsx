'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button, ErrorText, Field, Input, SuccessText } from '@/components/ui';
import { saveQrPrefsAction, type FormState } from '../actions';

const initial: FormState = {};

type Initial = {
  showName: boolean;
  showTagline: boolean;
  showAddress: boolean;
  showPhone: boolean;
  callToAction: string;
};

function FieldToggle({
  name,
  label,
  defaultChecked,
  available,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
  available: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span>
        <span className="block text-[15px]">{label}</span>
        {!available && (
          <span className="block text-[13px] text-ink-400">
            Add this in{' '}
            <Link href="/app/profile" className="underline">
              Shop details
            </Link>{' '}
            first
          </span>
        )}
      </span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={available && defaultChecked}
        disabled={!available}
        className="h-5 w-5 shrink-0 disabled:opacity-40"
      />
    </label>
  );
}

export function QrFieldsForm({
  initial: values,
  hasTagline,
  hasAddress,
  hasPhone,
}: {
  initial: Initial;
  hasTagline: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
}) {
  const [state, action, pending] = useActionState(saveQrPrefsAction, initial);

  return (
    <form action={action} className="card space-y-1 p-4">
      <h2 className="mb-1 font-display text-[16px] font-semibold">What shows on your printed standee</h2>
      <p className="mb-3 text-[13px] text-ink-500">
        The QR code always stays the main, biggest thing on the page — these just add small text
        above and below it. Pick what you want customers to see.
      </p>
      <ErrorText>{state.error}</ErrorText>
      <SuccessText>{state.success}</SuccessText>

      <div className="divide-y divide-ink-100">
        <FieldToggle name="showName" label="Shop name" defaultChecked={values.showName} available />
        <FieldToggle name="showTagline" label="Tagline" defaultChecked={values.showTagline} available={hasTagline} />
        <FieldToggle name="showAddress" label="Address" defaultChecked={values.showAddress} available={hasAddress} />
        <FieldToggle name="showPhone" label="Phone number" defaultChecked={values.showPhone} available={hasPhone} />
      </div>

      <div className="pt-3">
        <Field label="Custom message" hint="Shown above the code. Leave blank for 'Scan for offers, prices & contact'.">
          <Input name="callToAction" defaultValue={values.callToAction} maxLength={120} placeholder="Scan for offers, prices & contact" />
        </Field>
      </div>

      <Button type="submit" disabled={pending} className="mt-3 w-full">
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
