'use client';

import { useState } from 'react';
import { Field, Input, Select } from '@/components/ui';

/**
 * The offer's own "price" — how much is actually off — kept separate from
 * the free-text title/description so it can be shown structured ("25% off",
 * "₹50 off") wherever the offer is listed, not just inside a sentence a
 * merchant may or may not have typed.
 */
export function DiscountFields({
  defaultType = 'custom',
  defaultValue = '',
  defaultPercent = '',
}: {
  defaultType?: 'percent' | 'flat' | 'bogo' | 'custom';
  defaultValue?: string;
  defaultPercent?: string;
}) {
  const [type, setType] = useState(defaultType);

  return (
    <div className="space-y-3">
      <Field label="What's the offer?">
        <Select name="discountType" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="percent">Percentage off</option>
          <option value="flat">Fixed amount off (₹)</option>
          <option value="bogo">Buy one, get one</option>
          <option value="custom">Just describe it above</option>
        </Select>
      </Field>

      {type === 'percent' && (
        <Field label="Percent off">
          <Input name="discountPercent" inputMode="numeric" placeholder="20" defaultValue={defaultPercent} />
        </Field>
      )}

      {type === 'flat' && (
        <Field label="Amount off (₹)">
          <Input name="discountValue" inputMode="decimal" placeholder="100" defaultValue={defaultValue} />
        </Field>
      )}
    </div>
  );
}
