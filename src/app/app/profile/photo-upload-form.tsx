'use client';

import { useActionState, useState } from 'react';
import { Button, ErrorText, Field, Input, SuccessText } from '@/components/ui';
import { uploadPhotoAction, type FormState } from '../actions';

const initial: FormState = {};

export function PhotoUploadForm() {
  const [state, action, pending] = useActionState(uploadPhotoAction, initial);

  // Remounting the form after a successful upload clears the file input,
  // which cannot otherwise be cleared from React (it is uncontrolled).
  const [prevState, setPrevState] = useState(state);
  const [resetKey, setResetKey] = useState(0);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setResetKey((k) => k + 1);
  }

  return (
    <form action={action} key={resetKey} className="card space-y-3 p-4">
      <ErrorText>{state.error}</ErrorText>
      <SuccessText>{state.success}</SuccessText>

      <Field label="Add photos" hint="JPEG, PNG, WebP or AVIF, up to 12 MB each — pick several at once if you like">
        <Input name="file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple required />
      </Field>

      <Field label="Caption" hint="Optional — describes the photo(s) for customers">
        <Input name="altText" maxLength={300} placeholder="Inside the shop" />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Uploading…' : 'Add photo(s)'}
      </Button>
    </form>
  );
}
