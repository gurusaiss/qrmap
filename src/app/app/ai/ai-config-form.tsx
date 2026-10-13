'use client';

import { useActionState, useState } from 'react';
import { Button, ErrorText, Field, SuccessText, Textarea } from '@/components/ui';
import { saveAiConfigAction, type FormState } from '../actions';

const initial: FormState = {};

export function AiConfigForm({
  disabled,
  initial: values,
}: {
  disabled: boolean;
  initial: { isEnabled: boolean; extraInstructions: string };
}) {
  const [state, action, pending] = useActionState(saveAiConfigAction, initial);
  const [isEnabled, setIsEnabled] = useState(values.isEnabled);

  return (
    <form action={action} className="card space-y-4 p-4">
      <ErrorText>{state.error}</ErrorText>
      <SuccessText>{state.success}</SuccessText>

      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-[15px] font-medium">Show the assistant on my page</span>
          <span className="block text-[13px] text-ink-500">
            Customers can ask it questions and get instant answers, any time.
          </span>
        </span>
        <input
          type="checkbox"
          name="isEnabled"
          checked={isEnabled}
          onChange={(e) => setIsEnabled(e.target.checked)}
          disabled={disabled}
          className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-ink-200 transition-colors checked:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundImage:
              'radial-gradient(circle 9px at 3px 50%, white 100%, transparent 0)',
            backgroundPosition: isEnabled ? 'calc(100% - 3px) 50%' : '3px 50%',
            backgroundRepeat: 'no-repeat',
          }}
        />
      </label>

      <Field
        label="Extra instructions"
        hint="Anything specific you want it to mention or avoid — e.g. 'We don't do home delivery' or 'Mention our festival offer first'. Optional."
      >
        <Textarea
          name="extraInstructions"
          defaultValue={values.extraInstructions}
          maxLength={2000}
          disabled={disabled}
          placeholder="Keep answers short. We don't take advance bookings over chat."
        />
      </Field>

      <Button type="submit" disabled={pending || disabled} className="w-full">
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
