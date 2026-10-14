'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ErrorText, Input, SuccessText } from '@/components/ui';
import { deleteCatalogGroupAction, renameCatalogGroupAction, type FormState } from '../../../actions';

const initial: FormState = {};

export function GroupHeader({ groupId, name }: { groupId: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(renameCatalogGroupAction.bind(null, groupId), initial);
  const [deleting, startDelete] = useTransition();
  const router = useRouter();

  if (editing) {
    return (
      <form action={action} className="card space-y-2 p-3">
        <ErrorText>{state.error}</ErrorText>
        <SuccessText>{state.success}</SuccessText>
        <div className="flex items-end gap-2">
          <Input name="name" required maxLength={80} defaultValue={name} className="flex-1" />
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="font-display text-[22px] font-semibold">{name}</h1>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Rename
        </Button>
        <Button
          variant="ghost"
          disabled={deleting}
          onClick={() => {
            if (confirm(`Delete "${name}"? Items inside stay on your page as uncategorised.`)) {
              startDelete(async () => {
                await deleteCatalogGroupAction(groupId);
                router.push('/app/catalog');
              });
            }
          }}
        >
          Delete category
        </Button>
      </div>
    </div>
  );
}
