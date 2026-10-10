'use client';

import { useActionState, useState } from 'react';
import { Button, ErrorText, Field, Input, Select, SuccessText } from '@/components/ui';
import { addMemberAction, type FormState } from './actions';

const initial: FormState = {};

export function AddMemberForm() {
  const [state, action, pending] = useActionState(addMemberAction, initial);
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

      <Field label="Their mobile number">
        <Input name="phone" type="tel" required placeholder="98765 43210" />
      </Field>
      <Field label="Name" hint="Optional">
        <Input name="fullName" maxLength={120} />
      </Field>
      <Field label="Role">
        <Select name="role" defaultValue="staff">
          <option value="staff">Staff — can update offers and item availability</option>
          <option value="manager">Manager — can edit everything except billing and team</option>
          <option value="owner">Owner — full access, including billing and team</option>
        </Select>
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Adding…' : 'Add to team'}
      </Button>
    </form>
  );
}
