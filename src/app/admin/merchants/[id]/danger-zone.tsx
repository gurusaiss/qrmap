'use client';

import { useState, useTransition } from 'react';
import { Button, Card, ErrorText, Field, Input, SuccessText } from '@/components/ui';
import {
  activateTenantAction,
  changeSlugAction,
  deleteTenantAction,
  suspendTenantAction,
} from '../../actions';

/**
 * Every destructive action here is visually separated, requires typing the
 * business name (for delete) or an explicit confirmation (for suspend), and
 * states plainly what will happen to already-printed material.
 */
export function DangerZone({
  tenantId,
  displayName,
  status,
  currentSlug,
}: {
  tenantId: string;
  displayName: string;
  status: string;
  currentSlug: string;
}) {
  const [pending, start] = useTransition();
  const [newSlug, setNewSlug] = useState('');
  const [slugMessage, setSlugMessage] = useState<{ error?: string; success?: string }>({});
  const [confirmName, setConfirmName] = useState('');

  return (
    <div className="space-y-4">
      <Card className="border-warning-600/30 bg-warning-50/40">
        <h2 className="font-semibold">Change web address</h2>
        <p className="mt-1 text-[13px] text-ink-500">
          The current address (<span className="font-mono">/m/{currentSlug}</span>) will keep
          working and redirect to the new one forever. Nothing that was already printed breaks.
        </p>
        <ErrorText>{slugMessage.error}</ErrorText>
        <SuccessText>{slugMessage.success}</SuccessText>
        <div className="mt-3 flex gap-2">
          <Input
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder="new-address"
            pattern="[a-z0-9-]+"
          />
          <Button
            variant="secondary"
            disabled={pending || !newSlug}
            onClick={() =>
              start(async () => {
                const result = await changeSlugAction(tenantId, newSlug);
                setSlugMessage(result);
                if (result.success) setNewSlug('');
              })
            }
          >
            Change
          </Button>
        </div>
      </Card>

      <Card className="border-danger-600/30 bg-danger-50/40">
        <h2 className="font-semibold text-danger-600">Danger zone</h2>

        {status === 'suspended' ? (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[14px] text-ink-700">This business is suspended and hidden from customers.</p>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => start(() => activateTenantAction(tenantId))}
            >
              Reactivate
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[14px] text-ink-700">
              Hides the page from customers. The QR keeps pointing here, showing a &quot;temporarily
              unavailable&quot; message.
            </p>
            <Button
              variant="danger"
              disabled={pending || status === 'deleted'}
              onClick={() => {
                const reason = prompt('Reason for suspension (shown only to platform staff):') ?? '';
                if (reason !== '') start(() => suspendTenantAction(tenantId, reason));
              }}
            >
              Suspend
            </Button>
          </div>
        )}

        <div className="mt-4 border-t border-danger-600/20 pt-4">
          <p className="text-[14px] text-ink-700">
            Removes this business permanently. Its web address is never reused — anyone who scans an
            old code will see a clear &quot;no longer listed&quot; message, never another business.
          </p>
          <Field label={`Type "${displayName}" to confirm`}>
            <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
          </Field>
          <Button
            variant="danger"
            className="mt-2"
            disabled={pending || confirmName !== displayName || status === 'deleted'}
            onClick={() =>
              start(async () => {
                await deleteTenantAction(tenantId, confirmName);
              })
            }
          >
            Delete permanently
          </Button>
        </div>
      </Card>
    </div>
  );
}
