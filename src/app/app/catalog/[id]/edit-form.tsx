'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button, ErrorText, Field, Input, Select, SuccessText } from '@/components/ui';
import { updateCatalogItemAction, type FormState } from '../../actions';

const initial: FormState = {};

export function EditCatalogItemForm({
  itemId,
  kind,
  photos,
  initial: values,
}: {
  itemId: string;
  kind: 'service' | 'product';
  photos: { id: string; altText: string | null }[];
  initial: {
    name: string;
    description: string;
    price: string;
    priceMax: string;
    priceUnit: string;
    durationMinutes: string;
    minOrderQty: string;
    stockStatus: string;
    mediaId: string;
  };
}) {
  const [state, action, pending] = useActionState(updateCatalogItemAction.bind(null, itemId), initial);

  return (
    <form action={action} className="card space-y-3 p-4">
      <ErrorText>{state.error}</ErrorText>
      <SuccessText>{state.success}</SuccessText>

      <Field label="Name">
        <Input name="name" required maxLength={160} defaultValue={values.name} />
      </Field>

      <Field label="Description" hint="Optional">
        <Input name="description" maxLength={1000} defaultValue={values.description} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Price (₹)" hint="Leave blank for 'price on request'">
          <Input name="price" inputMode="decimal" defaultValue={values.price} />
        </Field>
        <Field label="Up to (₹)" hint="For a price range">
          <Input name="priceMax" inputMode="decimal" defaultValue={values.priceMax} />
        </Field>
      </div>

      {kind === 'service' ? (
        <Field label="Duration (minutes)" hint="Optional">
          <Input name="durationMinutes" inputMode="numeric" defaultValue={values.durationMinutes} />
        </Field>
      ) : (
        <Field label="Minimum order quantity" hint="For wholesale — leave blank otherwise">
          <Input name="minOrderQty" inputMode="numeric" defaultValue={values.minOrderQty} />
        </Field>
      )}

      <Field label="Unit" hint="e.g. per kg, per piece — optional">
        <Input name="priceUnit" maxLength={40} defaultValue={values.priceUnit} />
      </Field>

      <Field label="Stock status" hint="Shown to customers next to the price">
        <Select name="stockStatus" defaultValue={values.stockStatus}>
          <option value="">In stock (default — shows nothing extra)</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
          <option value="made_to_order">Made to order</option>
        </Select>
      </Field>

      <Field label="Photo" hint={photos.length === 0 ? undefined : 'Shown next to this item on your page'}>
        {photos.length === 0 ? (
          <p className="text-[13px] text-ink-500">
            No photos yet —{' '}
            <Link href="/app/profile" className="underline">
              add one in Shop details
            </Link>
            , then come back here to attach it.
          </p>
        ) : (
          <Select name="mediaId" defaultValue={values.mediaId}>
            <option value="">No photo</option>
            {photos.map((p, i) => (
              <option key={p.id} value={p.id}>
                {p.altText || `Photo ${i + 1}`}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Saving…' : 'Save changes'}
      </Button>

      <Link href="/app/catalog" className="block text-center text-[14px] text-ink-500 underline">
        Back to menu
      </Link>
    </form>
  );
}
