'use client';

import { useActionState, useState } from 'react';
import { Button, ErrorText, Field, Input, SuccessText } from '@/components/ui';
import { createCatalogGroupAction, type FormState } from '../actions';

const initial: FormState = {};

export function CategoryForm() {
  const [state, action, pending] = useActionState(createCatalogGroupAction, initial);
  const [resetKey, setResetKey] = useState(0);
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setResetKey((k) => k + 1);
  }

  return (
    <form action={action} key={resetKey} className="card space-y-2 p-3">
      <ErrorText>{state.error}</ErrorText>
      <SuccessText>{state.success}</SuccessText>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label="New category" hint="e.g. Breads, Cakes, Snacks">
            <Input name="name" required maxLength={80} placeholder="Category name" />
          </Field>
        </div>
        <Button type="submit" disabled={pending} className="mb-[1px]">
          {pending ? 'Adding…' : 'Add'}
        </Button>
      </div>
    </form>
  );
}
