import { requireMerchant } from '@/modules/auth/session-server';
import { can } from '@/modules/auth/rbac';
import { ButtonLink, PageHeader } from '@/components/ui';

export const metadata = { title: 'More' };

export default async function MorePage() {
  const { principal } = await requireMerchant();

  return (
    <div>
      <PageHeader title="More" />
      <div className="grid gap-3">
        <ButtonLink href="/app/profile" variant="secondary" className="justify-start px-4">
          Shop details
        </ButtonLink>
        {can(principal, 'members:read') && (
          <ButtonLink href="/app/team" variant="secondary" className="justify-start px-4">
            Team
          </ButtonLink>
        )}
        {can(principal, 'billing:read') && (
          <ButtonLink href="/app/plan" variant="secondary" className="justify-start px-4">
            Plan & billing
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
