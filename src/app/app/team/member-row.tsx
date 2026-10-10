'use client';

import { useTransition } from 'react';
import { Badge, Button, Select } from '@/components/ui';
import type { MerchantRole } from '@/modules/auth/rbac';
import { changeRoleAction, removeMemberAction } from './actions';

type Member = {
  membershipId: string;
  phone: string | null;
  fullName: string | null;
  role: MerchantRole;
  lastLoginAt: Date | null;
};

const ROLE_TONE: Record<MerchantRole, 'success' | 'info' | 'neutral'> = {
  owner: 'success',
  manager: 'info',
  staff: 'neutral',
};

export function MemberRow({
  member,
  canManage,
  isSelf,
}: {
  member: Member;
  canManage: boolean;
  isSelf: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="card flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {member.fullName || member.phone || 'Team member'}
          {isSelf && <span className="ml-2 text-[13px] text-ink-400">(you)</span>}
        </p>
        <p className="text-[13px] text-ink-500">
          {member.phone} · {member.lastLoginAt ? `Last signed in ${new Date(member.lastLoginAt).toLocaleDateString()}` : 'Never signed in'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canManage && !isSelf ? (
          <Select
            defaultValue={member.role}
            disabled={pending}
            onChange={(e) => start(() => void changeRoleAction(member.membershipId, e.target.value as MerchantRole))}
            className="w-auto"
          >
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
            <option value="owner">Owner</option>
          </Select>
        ) : (
          <Badge tone={ROLE_TONE[member.role]}>{member.role}</Badge>
        )}
        {canManage && !isSelf && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (confirm('Remove this person from your team?')) {
                start(() => void removeMemberAction(member.membershipId));
              }
            }}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
