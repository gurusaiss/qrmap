import { eq, and, desc } from 'drizzle-orm';
import { requireMerchant } from '@/modules/auth/session-server';
import { can } from '@/modules/auth/rbac';
import { withTenant } from '@/modules/tenancy';
import { schema } from '@/modules/db/client';
import { maskNumber } from '@/modules/notify/monthly-report';
import { reportRecipientFor } from '@/modules/notify/send-reports';
import { getLoginMethod } from '@/modules/auth/service';
import { EmptyState, PageHeader } from '@/components/ui';
import { ChangePasswordForm } from './change-password-form';
import { ChangePinForm } from './change-pin-form';
import { MonthlyReportSwitch } from './monthly-report-switch';

export const metadata = { title: 'Account & security' };

export default async function AccountPage() {
  const { session, principal, tenantId } = await requireMerchant();
  const method = await getLoginMethod(session.userId);
  const [number, state] = await Promise.all([
    reportRecipientFor(tenantId),
    withTenant(tenantId, async ({ tx }) => {
      const [profile] = await tx
        .select({ on: schema.businessProfiles.monthlyReportWhatsapp })
        .from(schema.businessProfiles)
        .where(eq(schema.businessProfiles.tenantId, tenantId))
        .limit(1);
      const [last] = await tx
        .select({ period: schema.reportDeliveries.period })
        .from(schema.reportDeliveries)
        .where(and(eq(schema.reportDeliveries.tenantId, tenantId), eq(schema.reportDeliveries.status, 'sent')))
        .orderBy(desc(schema.reportDeliveries.period))
        .limit(1);
      return { on: profile?.on ?? false, lastPeriod: last?.period ?? null };
    }),
  ]);

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

      <MonthlyReportSwitch
        enabled={state.on}
        canChange={can(principal, 'profile:write')}
        maskedNumber={number ? maskNumber(number) : null}
        lastSent={state.lastPeriod}
      />

      {method.kind === 'none' && (
        <EmptyState
          title="No sign-in credential found"
          body="Contact your platform admin to set up how you sign in."
        />
      )}
    </div>
  );
}
