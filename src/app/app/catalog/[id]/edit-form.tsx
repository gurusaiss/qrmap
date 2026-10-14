'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Button, ErrorText, Field, Input, Select, SuccessText } from '@/components/ui';
import { updateCatalogItemAction, type FormState } from '../../actions';

const initial: FormState = {};

export function EditCatalogItemForm({
  itemId,
  kind,
  currentPhotoUrl,
  initial: values,
}: {
  itemId: string;
  kind: 'service' | 'product';
  currentPhotoUrl: string | null;
  initial: {
    name: string;
    description: string;
    price: string;
    priceMax: string;
    priceUnit: string;
    durationMinutes: string;
    minOrderQty: string;
    stockStatus: string;
  };
}) {
  const [state, action, pending] = useActionState(updateCatalogItemAction.bind(null, itemId), initial);
  const [priceOnRequest, setPriceOnRequest] = useState(values.price === '' && values.priceMax === '');
  const [removePhoto, setRemovePhoto] = useState(false);

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
        <Field label="Price (₹)">
          <Input
            name="price"
            inputMode="decimal"
            defaultValue={values.price}
            required={!priceOnRequest}
            disabled={priceOnRequest}
          />
        </Field>
        <Field label="Up to (₹)" hint="For a price range">
          <Input name="priceMax" inputMode="decimal" defaultValue={values.priceMax} disabled={priceOnRequest} />
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

      <Field label="Photo" hint="Optional — shown next to this item on your page">
        {currentPhotoUrl && !removePhoto && (
          <div className="mb-2 flex items-center gap-3">
            <img src={currentPhotoUrl} alt="" className="h-16 w-16 rounded-[var(--radius-sm)] object-cover" />
            <label className="flex items-center gap-2 text-[13px] text-ink-500">
              <input
                type="checkbox"
                name="removePhoto"
                checked={removePhoto}
                onChange={(e) => setRemovePhoto(e.target.checked)}
                className="h-4 w-4"
              />
              Remove this photo
            </label>
          </div>
        )}
        <input type="file" name="photo" accept="image/*" className="w-full text-[14px]" />
        <p className="mt-1 text-[12px] text-ink-400">
          {currentPhotoUrl ? 'Choose a new file to replace it.' : 'Up to 12MB. JPG, PNG, WebP or AVIF.'}
        </p>
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
