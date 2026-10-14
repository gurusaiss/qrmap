'use client';

import { useActionState, useState } from 'react';
import { Button, ErrorText, Field, Input, Select } from '@/components/ui';
import { createTenantAction, type FormState } from '../../actions';

const initial: FormState = {};

/**
 * Ask the merchant which they'd rather sign in with BEFORE filling in the
 * rest of the form - the two fields below are literally what that answer
 * determines, so the choice has to come first, not as an afterthought at
 * the bottom (docs/09). Whichever one is set here is the single source of
 * truth for that merchant's login: there is no separate invite link, no
 * temporary password, no "verify your email" step.
 */
export function NewMerchantForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createTenantAction, initial);
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');

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

      <Field label="Business contact phone" hint="Shown to customers on the shop page — not used for login">
        <Input name="phone" type="tel" />
      </Field>

      <Field label="City">
        <Input name="city" />
      </Field>

      <div className="border-t border-ink-200 pt-4">
        <p className="mb-1 text-[14px] font-semibold">Merchant login</p>
        <p className="mb-3 text-[13px] text-ink-500">
          Ask the merchant: email or mobile number? Set it up here, then give them the login you
          choose below.
        </p>

        <Field label="Owner's name" hint="Optional">
          <Input name="ownerFullName" />
        </Field>

        <div className="mt-3 mb-3 flex gap-2">
          <input type="hidden" name="loginMethod" value={loginMethod} />
          <Button
            type="button"
            variant={loginMethod === 'email' ? 'primary' : 'secondary'}
            className="flex-1"
            onClick={() => setLoginMethod('email')}
          >
            Email
          </Button>
          <Button
            type="button"
            variant={loginMethod === 'phone' ? 'primary' : 'secondary'}
            className="flex-1"
            onClick={() => setLoginMethod('phone')}
          >
            Mobile number
          </Button>
        </div>

        {loginMethod === 'email' ? (
          <div className="space-y-3">
            <Field label="Owner's email">
              <Input name="ownerEmail" type="email" required={loginMethod === 'email'} />
            </Field>
            <Field label="Password" hint="At least 10 characters. Share this with the merchant yourself.">
              <Input name="ownerPassword" type="text" minLength={10} required={loginMethod === 'email'} />
            </Field>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Owner's mobile number">
              <Input name="ownerPhone" type="tel" required={loginMethod === 'phone'} />
            </Field>
            <Field label="PIN" hint="Exactly 6 digits. Share this with the merchant yourself.">
              <Input
                name="ownerPin"
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]{6}"
                required={loginMethod === 'phone'}
              />
            </Field>
          </div>
        )}
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creating…' : 'Create merchant'}
      </Button>
    </form>
  );
}
