'use client';

import { useActionState, useState } from 'react';
import { Button, ErrorText, Field, Input, Select, SuccessText } from '@/components/ui';
import { createCatalogItemAction, type FormState } from '../actions';

const initial: FormState = {};

/**
 * One form for both services and products - they differ by a single field
 * (duration vs stock), which is why the underlying schema merges them too
 * (decision D15). Two separate forms would mean maintaining two near-identical
 * screens for no merchant benefit.
 */
export function CatalogForm() {
  const [state, action, pending] = useActionState(createCatalogItemAction, initial);
  const [kind, setKind] = useState<'service' | 'product'>('service');

  return (
    <form action={action} key={state.success ? Math.random() : 'form'} className="card space-y-3 p-4">
      <ErrorText>{state.error}</ErrorText>
      <SuccessText>{state.success}</SuccessText>

      <Field label="Type">
        <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as 'service' | 'product')}>
          <option value="service">Service (haircut, repair, consultation…)</option>
          <option value="product">Product (item you sell)</option>
        </Select>
      </Field>

      <Field label="Name">
        <Input name="name" required maxLength={160} placeholder={kind === 'service' ? 'Haircut' : 'Beard oil (50ml)'} />
      </Field>

      <Field label="Description" hint="Optional">
        <Input name="description" maxLength={1000} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Price (₹)" hint="Leave blank for 'price on request'">
          <Input name="price" inputMode="decimal" placeholder="150" />
        </Field>
        <Field label="Up to (₹)" hint="For a price range">
          <Input name="priceMax" inputMode="decimal" placeholder="Optional" />
        </Field>
      </div>

      {kind === 'service' ? (
        <Field label="Duration (minutes)" hint="Optional">
          <Input name="durationMinutes" inputMode="numeric" placeholder="30" />
        </Field>
      ) : (
        <Field label="Minimum order quantity" hint="For wholesale — leave blank otherwise">
          <Input name="minOrderQty" inputMode="numeric" />
        </Field>
      )}

      <Field label="Unit" hint="e.g. per kg, per piece — optional">
        <Input name="priceUnit" maxLength={40} />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Adding…' : 'Add to my page'}
      </Button>
    </form>
  );
}
