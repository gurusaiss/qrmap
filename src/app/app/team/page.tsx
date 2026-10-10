import { requireMerchant } from '@/modules/auth/session-server';
import { listMembers } from '@/modules/merchants/members';
import { can } from '@/modules/auth/rbac';
import { EmptyState, PageHeader } from '@/components/ui';
import { AddMemberForm } from './add-member-form';
import { MemberRow } from './member-row';

export const metadata = { title: 'Team' };

export default async function TeamPage() {
  const { tenantId, principal } = await requireMerchant('members:read');
  const members = await listMembers(tenantId);
  const canManage = can(principal, 'members:write');

  return (
    <div>
      <PageHeader
        title="Team"
        description="Add anyone who helps run this business. They sign in with their own mobile number - no password to share."
      />

      {canManage && <AddMemberForm />}

      <div className="mt-6 space-y-3">
        {members.length === 0 ? (
          <EmptyState title="Just you, for now" body="Add a manager or staff member above." />
        ) : (
          members.map((member) => (
            <MemberRow
              key={member.membershipId}
              member={member}
              canManage={canManage}
              isSelf={member.userId === principal.userId}
            />
          ))
        )}
      </div>
    </div>
  );
}
