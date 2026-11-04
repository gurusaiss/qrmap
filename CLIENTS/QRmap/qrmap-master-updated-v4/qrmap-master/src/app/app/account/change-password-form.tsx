'use client';

import { useActionState } from 'react';
import { Button, ErrorText, Field, Input, SuccessText } from '@/components/ui';
import { changePasswordAction, type FormState } from '../actions';

const initial: FormState = {};

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);

  return (
    <form action={action} className="card space-y-3 p-4">
      <ErrorText>{state.error}</ErrorText>
      <SuccessText>{state.success}</SuccessText>

      <Field label="New password" hint="At least 10 characters">
        <Input name="password" type="password" required minLength={10} autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password">
        <Input name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Saving…' : 'Update password'}
      </Button>
    </form>
  );
}
