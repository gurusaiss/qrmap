'use client';

import { useState, useTransition } from 'react';
import { Button, ErrorText } from '@/components/ui';
import { impersonateTenantAction } from '../../actions';

export function ImpersonateButton({ tenantId, label }: { tenantId: string; label?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>();

  return (
    <div className="space-y-2">
      <ErrorText>{error}</ErrorText>
      <Button
        variant={label ? 'primary' : 'secondary'}
        className={label ? 'w-full' : undefined}
        disabled={pending}
        onClick={() => {
          setError(undefined);
          start(async () => {
            const result = await impersonateTenantAction(tenantId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? 'Signing in…' : (label ?? 'View as this merchant')}
      </Button>
    </div>
  );
}
