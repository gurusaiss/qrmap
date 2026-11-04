'use client';

import { useActionState } from 'react';
import { Button, ErrorText, Field, Input, SuccessText } from '@/components/ui';
import { changePinAction, type FormState } from '../actions';

const initial: FormState = {};

export function ChangePinForm() {
  const [state, action, pending] = useActionState(changePinAction, initial);

  return (
    <form action={action} className="card space-y-3 p-4">
      <ErrorText>{state.error}</ErrorText>
      <SuccessText>{state.success}</SuccessText>

      <Field label="New PIN" hint="Exactly 6 digits">
        <Input
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
          autoComplete="new-password"
        />
      </Field>
      <Field label="Confirm new PIN">
        <Input
          name="confirmPin"
          type="password"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
          autoComplete="new-password"
        />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Saving…' : 'Update PIN'}
      </Button>
    </form>
  );
}
