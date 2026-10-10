'use client';

import { useActionState, useState } from 'react';
import { Button, ErrorText, Field, Input, Select, SuccessText } from '@/components/ui';
import { createCategoryAction, type FormState } from './actions';

const initial: FormState = {};

export function CreateCategoryForm() {
  const [state, action, pending] = useActionState(createCategoryAction, initial);
  const [prevState, setPrevState] = useState(state);
  const [resetKey, setResetKey] = useState(0);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setResetKey((k) => k + 1);
  }

  return (
    <form action={action} key={resetKey} className="card flex flex-wrap items-end gap-3 p-4">
      <ErrorText>{state.error}</ErrorText>
      <SuccessText>{state.success}</SuccessText>
      <Field label="Category name">
        <Input name="name" required maxLength={100} placeholder="Tailoring" />
      </Field>
      <Field label="Template">
        <Select name="templateKey" defaultValue="generic">
          <option value="generic">Generic</option>
          <option value="services">Services (duration-based)</option>
          <option value="menu">Menu</option>
          <option value="retail">Retail</option>
          <option value="wholesale">Wholesale</option>
        </Select>
      </Field>
      <label className="flex items-center gap-2 pb-2 text-[14px]">
        <input type="checkbox" name="aiEnabledByDefault" defaultChecked className="h-5 w-5" />
        AI on by default
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add category'}
      </Button>
    </form>
  );
}
