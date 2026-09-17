'use client';

import { useActionState } from 'react';
import { Button, ErrorText, Field, Input, SuccessText, Textarea } from '@/components/ui';
import { saveProfileAction, type FormState } from '../actions';

type Initial = Record<string, string>;

export function ProfileForm({ initial }: { initial: Initial }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfileAction, {});

  return (
    <form action={action} className="space-y-4">
      <ErrorText>{state.error}</ErrorText>
      <SuccessText>{state.success}</SuccessText>

      <Field label="Shop name">
        <Input name="displayName" defaultValue={initial['displayName']} required maxLength={120} />
      </Field>
      <Field label="One-line description" hint="Shown under your shop name.">
        <Input name="tagline" defaultValue={initial['tagline']} maxLength={160} />
      </Field>
      <Field label="About your shop">
        <Textarea name="description" defaultValue={initial['description']} maxLength={2000} />
      </Field>

      <Field label="Phone number" hint="Customers tap this to call you.">
        <Input name="phone" type="tel" defaultValue={initial['phone']} />
      </Field>
      <Field label="WhatsApp number">
        <Input name="whatsapp" type="tel" defaultValue={initial['whatsapp']} />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" defaultValue={initial['email']} />
      </Field>
      <Field label="Website">
        <Input name="websiteUrl" type="url" defaultValue={initial['websiteUrl']} placeholder="https://" />
      </Field>

      <Field label="Address">
        <Input name="addressLine1" defaultValue={initial['addressLine1']} placeholder="Shop number, street" />
      </Field>
      <Field label="Area / landmark">
        <Input name="addressLine2" defaultValue={initial['addressLine2']} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City">
          <Input name="city" defaultValue={initial['city']} />
        </Field>
        <Field label="PIN code">
          <Input name="pincode" inputMode="numeric" defaultValue={initial['pincode']} />
        </Field>
      </div>
      <Field label="State">
        <Input name="state" defaultValue={initial['state']} />
      </Field>
      <Field label="Google Maps link" hint="Paste the share link from Google Maps.">
        <Input name="googleMapsUrl" type="url" defaultValue={initial['googleMapsUrl']} placeholder="https://" />
      </Field>
      <Field label="Google review link" hint="Send happy customers here to leave a review.">
        <Input name="gbpReviewUrl" type="url" defaultValue={initial['gbpReviewUrl']} placeholder="https://" />
      </Field>
      <Field label="Page colour">
        <Input name="accentColor" type="color" defaultValue={initial['accentColor']} className="h-12 p-1" />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
