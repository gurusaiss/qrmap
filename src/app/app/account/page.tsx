import { requireMerchant } from '@/modules/auth/session-server';
import { getLoginMethod } from '@/modules/auth/service';
import { EmptyState, PageHeader } from '@/components/ui';
import { ChangePasswordForm } from './change-password-form';
import { ChangePinForm } from './change-pin-form';

export const metadata = { title: 'Account & security' };

export default async function AccountPage() {
  const { session } = await requireMerchant();
  const method = await getLoginMethod(session.userId);

  return (
    <div>
      <PageHeader title="Account & security" description="How you sign in to this dashboard." />

      {method.kind === 'email' && (
        <>
          <p className="mb-3 text-[13px] text-ink-500">
            You sign in with <strong>{method.email}</strong> and a password.
          </p>
          <ChangePasswordForm />
        </>
      )}

      {method.kind === 'phone' && (
        <>
          <p className="mb-3 text-[13px] text-ink-500">
            You sign in with <strong>{method.phone}</strong> and a 6-digit PIN.
          </p>
          <ChangePinForm />
        </>
      )}

      {method.kind === 'none' && (
        <EmptyState
          title="No sign-in credential found"
          body="Contact your platform admin to set up how you sign in."
        />
      )}
    </div>
  );
}
