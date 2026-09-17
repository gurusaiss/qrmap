'use client';

import { useActionState } from 'react';
import { Button, ErrorText, Field, Input, Select } from '@/components/ui';
import { createTenantAction, type FormState } from '../../actions';

const initial: FormState = {};

export function NewMerchantForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createTenantAction, initial);

  return (
    <form action={action} className="card space-y-4 p-4">
      <ErrorText>{state.error}</ErrorText>

      <Field label="Business name">
        <Input name="displayName" required maxLength={120} />
      </Field>

      <Field label="Category">
        <Select name="categoryId" required defaultValue="">
          <option value="" disabled>
            Choose a category
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Web address" hint="Leave blank to generate one from the business name. Cannot be changed later without keeping the old one working.">
        <Input name="slug" placeholder="sharma-hair-salon" pattern="[a-z0-9-]+" />
      </Field>

      <Field label="Phone">
        <Input name="phone" type="tel" />
      </Field>

      <Field label="City">
        <Input name="city" />
      </Field>

      <Field label="Owner's mobile number" hint="They'll be able to sign in with this number.">
        <Input name="ownerPhone" type="tel" />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creating…' : 'Create merchant'}
      </Button>
    </form>
  );
}
