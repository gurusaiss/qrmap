'use client';

import { useActionState, useState } from 'react';
import { Button, ErrorText, Field, Input, Select, SuccessText } from '@/components/ui';
import { createCatalogItemAction, type FormState } from '../actions';

const initial: FormState = {};
const MAX_PHOTO_MB = 12;

/**
 * One form for both services and products - they differ by a single field
 * (duration vs stock), which is why the underlying schema merges them too
 * (decision D15). Two separate forms would mean maintaining two near-identical
 * screens for no merchant benefit.
 */
export function CatalogForm({
  groups = [],
  defaultGroupId,
}: {
  groups?: { id: string; name: string }[];
  defaultGroupId?: string;
}) {
  const [state, action, pending] = useActionState(createCatalogItemAction, initial);
  const [kind, setKind] = useState<'service' | 'product'>('service');
  const [priceOnRequest, setPriceOnRequest] = useState(false);

  // Remounting the form clears its uncontrolled inputs after a successful
  // add. Adjusting state during render (rather than in an effect) is the
  // React-documented pure way to do this: https://react.dev/learn/you-might-not-need-an-effect
  const [prevState, setPrevState] = useState(state);
  const [resetKey, setResetKey] = useState(0);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) {
      setResetKey((k) => k + 1);
      setPriceOnRequest(false);
    }
  }

  return (
    <form action={action} key={resetKey} className="card space-y-3 p-4">
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
        <Field label="Price (₹)">
          <Input
            name="price"
            inputMode="decimal"
            placeholder="150"
            required={!priceOnRequest}
            disabled={priceOnRequest}
          />
        </Field>
        <Field label="Up to (₹)" hint="For a price range">
          <Input name="priceMax" inputMode="decimal" placeholder="Optional" disabled={priceOnRequest} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-[14px]">
        <input
          type="checkbox"
          name="priceOnRequest"
          checked={priceOnRequest}
          onChange={(e) => setPriceOnRequest(e.target.checked)}
          className="h-5 w-5"
        />
        Price on request (don&apos;t show a fixed price)
      </label>

      <Field label="Photo" hint="Optional — shown next to this item on your page">
        <input type="file" name="photo" accept="image/*" className="w-full text-[14px]" />
        <p className="mt-1 text-[12px] text-ink-400">Up to {MAX_PHOTO_MB}MB. JPG, PNG, WebP or AVIF.</p>
      </Field>

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

      {defaultGroupId ? (
        <input type="hidden" name="groupId" value={defaultGroupId} />
      ) : (
        groups.length > 0 && (
          <Field label="Category" hint="Optional">
            <Select name="groupId" defaultValue="">
              <option value="">No category</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
        )
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Adding…' : 'Add to my page'}
      </Button>
    </form>
  );
}
