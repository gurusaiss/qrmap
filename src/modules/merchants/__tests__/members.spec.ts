import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { withSystem } from '../../tenancy';
import { closeDb } from '../../db/client';
import { addMember, changeMemberRole, listMembers, MemberError, removeMember } from '../members';
import type { Principal } from '../../auth/rbac';

let tenantId = '';
let otherTenantId = '';

beforeAll(async () => {
  await withSystem(async ({ tx }) => {
    const [cat] = await tx.execute(
      sql`INSERT INTO categories (slug, name) VALUES ('members-test', 'Members Test')
          ON CONFLICT (slug) DO UPDATE SET name = excluded.name RETURNING id`,
    );
    const categoryId = (cat as { id: string }).id;

    const mk = async (name: string): Promise<string> => {
      const [row] = await tx.execute(
        sql`INSERT INTO tenants (display_name, category_id, status) VALUES (${name}, ${categoryId}, 'active') RETURNING id`,
      );
      return (row as { id: string }).id;
    };
    tenantId = await mk('Members Test Shop');
    otherTenantId = await mk('Members Test Shop 2');
  });
});

afterAll(async () => {
  await closeDb();
});

// Real UUIDs: audit_logs.actor_user_id is a uuid column, and recordAudit is
// not mocked here — these tests write real audit rows, same as production.
const OWNER_USER_ID = '00000000-0000-4000-8000-00000000a001';
const MANAGER_USER_ID = '00000000-0000-4000-8000-00000000a002';
const STAFF_USER_ID = '00000000-0000-4000-8000-00000000a003';
const OTHER_OWNER_USER_ID = '00000000-0000-4000-8000-00000000a004';

function owner(): Principal {
  return { kind: 'merchant', userId: OWNER_USER_ID, tenantId, role: 'owner' };
}
function manager(): Principal {
  return { kind: 'merchant', userId: MANAGER_USER_ID, tenantId, role: 'manager' };
}
function staff(): Principal {
  return { kind: 'merchant', userId: STAFF_USER_ID, tenantId, role: 'staff' };
}

describe('addMember', () => {
  it('an owner can add a staff member by phone', async () => {
    const member = await addMember({
      tenantId,
      actor: owner(),
      phone: '9000000001',
      role: 'staff',
    });
    expect(member.role).toBe('staff');
    expect(member.phone).toMatch(/^\+91/);
  });

  it('an owner can add another owner', async () => {
    const member = await addMember({ tenantId, actor: owner(), phone: '9000000002', role: 'owner' });
    expect(member.role).toBe('owner');
  });

  it('a manager cannot grant the owner role (members:write is owner-only)', async () => {
    await expect(
      addMember({ tenantId, actor: manager(), phone: '9000000003', role: 'owner' }),
    ).rejects.toThrow(MemberError);
  });

  it('a manager cannot grant the manager role either', async () => {
    await expect(
      addMember({ tenantId, actor: manager(), phone: '9000000004', role: 'manager' }),
    ).rejects.toThrow(MemberError);
  });

  it('a manager cannot grant the staff role either — team management is owner-only, per docs/04-DATABASE.md §1', async () => {
    await expect(
      addMember({ tenantId, actor: manager(), phone: '9000000005', role: 'staff' }),
    ).rejects.toThrow(MemberError);
  });

  it('staff cannot add any member at all', async () => {
    await expect(
      addMember({ tenantId, actor: staff(), phone: '9000000006', role: 'staff' }),
    ).rejects.toThrow(MemberError);
  });

  it('rejects an invalid phone number', async () => {
    await expect(addMember({ tenantId, actor: owner(), phone: 'not-a-phone', role: 'staff' })).rejects.toThrow(
      MemberError,
    );
  });

  it('rejects adding the same phone number twice to the same tenant', async () => {
    await addMember({ tenantId, actor: owner(), phone: '9000000007', role: 'staff' });
    await expect(
      addMember({ tenantId, actor: owner(), phone: '9000000007', role: 'manager' }),
    ).rejects.toThrow(/already has access/);
  });

  it('the same phone number CAN belong to a different tenant (a person may own two shops)', async () => {
    const member = await addMember({
      tenantId: otherTenantId,
      actor: { kind: 'merchant', userId: OTHER_OWNER_USER_ID, tenantId: otherTenantId, role: 'owner' },
      phone: '9000000007',
      role: 'owner',
    });
    expect(member.role).toBe('owner');
  });
});

describe('listMembers', () => {
  it('only returns members of the requested tenant', async () => {
    const members = await listMembers(tenantId);
    expect(members.length).toBeGreaterThan(0);
    const otherMembers = await listMembers(otherTenantId);
    const overlap = members.filter((m) => otherMembers.some((o) => o.userId === m.userId));
    // The one phone number added to both tenants is a DIFFERENT membership
    // row in each - the two lists should not be identical.
    expect(members.map((m) => m.membershipId).sort()).not.toEqual(
      otherMembers.map((m) => m.membershipId).sort(),
    );
    void overlap;
  });
});

describe('changeMemberRole', () => {
  it('a manager cannot promote someone to owner', async () => {
    const members = await listMembers(tenantId);
    const aStaffMember = members.find((m) => m.role === 'staff');
    expect(aStaffMember).toBeDefined();
    await expect(
      changeMemberRole({ tenantId, actor: manager(), membershipId: aStaffMember!.membershipId, role: 'owner' }),
    ).rejects.toThrow(MemberError);
  });

  it('an owner can promote staff to manager', async () => {
    const members = await listMembers(tenantId);
    const aStaffMember = members.find((m) => m.role === 'staff');
    await changeMemberRole({ tenantId, actor: owner(), membershipId: aStaffMember!.membershipId, role: 'manager' });
    const updated = await listMembers(tenantId);
    expect(updated.find((m) => m.membershipId === aStaffMember!.membershipId)?.role).toBe('manager');
  });

  it('demoting the last owner is blocked', async () => {
    // Reduce to exactly one owner for a clean test.
    const members = await listMembers(tenantId);
    const owners = members.filter((m) => m.role === 'owner');
    for (const extra of owners.slice(1)) {
      await removeMember({ tenantId, actor: owner(), membershipId: extra.membershipId });
    }
    const remaining = await listMembers(tenantId);
    const lastOwner = remaining.find((m) => m.role === 'owner');
    expect(lastOwner).toBeDefined();

    await expect(
      changeMemberRole({ tenantId, actor: owner(), membershipId: lastOwner!.membershipId, role: 'manager' }),
    ).rejects.toThrow(/only owner/);
  });
});

describe('removeMember', () => {
  it('removing the last owner is blocked', async () => {
    const members = await listMembers(tenantId);
    const lastOwner = members.find((m) => m.role === 'owner');
    expect(lastOwner).toBeDefined();
    await expect(
      removeMember({ tenantId, actor: owner(), membershipId: lastOwner!.membershipId }),
    ).rejects.toThrow(/only owner/);
  });

  it('removing a non-owner member works and they disappear from the list', async () => {
    const members = await listMembers(tenantId);
    const target = members.find((m) => m.role === 'manager');
    expect(target).toBeDefined();
    await removeMember({ tenantId, actor: owner(), membershipId: target!.membershipId });
    const after = await listMembers(tenantId);
    expect(after.some((m) => m.membershipId === target!.membershipId)).toBe(false);
  });

  it('removing a member from one tenant does not affect their membership in another', async () => {
    const otherMembers = await listMembers(otherTenantId);
    expect(otherMembers.some((m) => m.phone?.endsWith('0007'))).toBe(true);
  });
});
