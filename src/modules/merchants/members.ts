/**
 * Team members for a merchant.
 *
 * Wires up the `members:read` / `members:write` permissions that RBAC has
 * always defined. Roles follow docs/04-DATABASE.md §1: owner (everything),
 * manager (content + analytics), staff (day-to-day toggles).
 *
 * A member is added by PHONE, not email: the person then signs in with the
 * ordinary phone-OTP flow, so there is no invite-link mechanism to secure,
 * no invite token to expire, and no password to set. Adding someone simply
 * grants their phone number access to this tenant.
 */
import { and, eq } from 'drizzle-orm';
import { withSystem } from '../tenancy';
import { schema } from '../db/client';
import { normalisePhone } from '../auth/service';
import { canAssignRole, type MerchantRole, type Principal } from '../auth/rbac';
import { recordAudit } from '../core/audit';

export class MemberError extends Error {
  override readonly name = 'MemberError';
}

export type Member = {
  membershipId: string;
  userId: string;
  phone: string | null;
  fullName: string | null;
  role: MerchantRole;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export async function listMembers(tenantId: string): Promise<Member[]> {
  return withSystem(({ tx }) =>
    tx
      .select({
        membershipId: schema.memberships.id,
        userId: schema.users.id,
        phone: schema.users.phone,
        fullName: schema.users.fullName,
        role: schema.memberships.role,
        lastLoginAt: schema.users.lastLoginAt,
        createdAt: schema.memberships.createdAt,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.tenantId, tenantId)),
  );
}

export async function addMember(args: {
  tenantId: string;
  actor: Principal;
  phone: string;
  fullName?: string | null;
  role: MerchantRole;
}): Promise<Member> {
  // A member may never grant a role ABOVE their own (same-level is fine —
  // see the comment on canAssignRole for why).
  if (!canAssignRole(args.actor, args.role)) {
    throw new MemberError('You cannot grant a role at or above your own.');
  }

  const phone = normalisePhone(args.phone);
  if (!phone) throw new MemberError('Enter a valid mobile number.');

  const member = await withSystem(async ({ tx }) => {
    let [user] = await tx.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
    if (!user) {
      [user] = await tx
        .insert(schema.users)
        .values({ phone, fullName: args.fullName ?? null })
        .returning();
    }
    if (!user) throw new MemberError('Could not create that user.');

    const [existing] = await tx
      .select()
      .from(schema.memberships)
      .where(
        and(eq(schema.memberships.userId, user.id), eq(schema.memberships.tenantId, args.tenantId)),
      )
      .limit(1);
    if (existing) throw new MemberError('That person already has access to this business.');

    const [membership] = await tx
      .insert(schema.memberships)
      .values({ userId: user.id, tenantId: args.tenantId, role: args.role })
      .returning();
    if (!membership) throw new MemberError('Could not add that member.');

    return {
      membershipId: membership.id,
      userId: user.id,
      phone: user.phone,
      fullName: user.fullName,
      role: membership.role,
      lastLoginAt: user.lastLoginAt,
      createdAt: membership.createdAt,
    };
  });

  await recordAudit({
    action: 'member.add',
    actorUserId: args.actor.kind === 'anon' ? null : args.actor.userId,
    actorType: args.actor.kind === 'platform' ? 'platform' : 'merchant',
    tenantId: args.tenantId,
    entityType: 'membership',
    entityId: member.membershipId,
    after: { phone: member.phone, role: member.role },
  });

  return member;
}

export async function changeMemberRole(args: {
  tenantId: string;
  actor: Principal;
  membershipId: string;
  role: MerchantRole;
}): Promise<void> {
  if (!canAssignRole(args.actor, args.role)) {
    throw new MemberError('You cannot grant a role at or above your own.');
  }

  await withSystem(async ({ tx }) => {
    const [membership] = await tx
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.id, args.membershipId),
          eq(schema.memberships.tenantId, args.tenantId),
        ),
      )
      .limit(1);
    if (!membership) throw new MemberError('That member was not found.');

    // Demoting an owner is only safe if another owner remains, otherwise the
    // business locks itself out of its own billing and member management.
    if (membership.role === 'owner' && args.role !== 'owner') {
      await assertAnotherOwnerExists(tx, args.tenantId, membership.id);
    }

    await tx
      .update(schema.memberships)
      .set({ role: args.role })
      .where(eq(schema.memberships.id, args.membershipId));

    await recordAudit({
      action: 'member.role_change',
      actorUserId: args.actor.kind === 'anon' ? null : args.actor.userId,
      actorType: args.actor.kind === 'platform' ? 'platform' : 'merchant',
      tenantId: args.tenantId,
      entityType: 'membership',
      entityId: args.membershipId,
      before: { role: membership.role },
      after: { role: args.role },
    });
  });
}

export async function removeMember(args: {
  tenantId: string;
  actor: Principal;
  membershipId: string;
}): Promise<void> {
  await withSystem(async ({ tx }) => {
    const [membership] = await tx
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.id, args.membershipId),
          eq(schema.memberships.tenantId, args.tenantId),
        ),
      )
      .limit(1);
    if (!membership) throw new MemberError('That member was not found.');

    if (membership.role === 'owner') {
      await assertAnotherOwnerExists(tx, args.tenantId, membership.id);
    }

    await tx.delete(schema.memberships).where(eq(schema.memberships.id, args.membershipId));

    await recordAudit({
      action: 'member.remove',
      actorUserId: args.actor.kind === 'anon' ? null : args.actor.userId,
      actorType: args.actor.kind === 'platform' ? 'platform' : 'merchant',
      tenantId: args.tenantId,
      entityType: 'membership',
      entityId: args.membershipId,
      before: { role: membership.role, userId: membership.userId },
    });
  });
}

type Tx = Parameters<Parameters<typeof withSystem>[0]>[0]['tx'];

/** Guards against a business removing or demoting its last owner. */
async function assertAnotherOwnerExists(
  tx: Tx,
  tenantId: string,
  excludingMembershipId: string,
): Promise<void> {
  const owners = await tx
    .select({ id: schema.memberships.id })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.tenantId, tenantId), eq(schema.memberships.role, 'owner')));

  const others = owners.filter((o) => o.id !== excludingMembershipId);
  if (others.length === 0) {
    throw new MemberError(
      'This is the only owner. Add another owner first, otherwise nobody could manage this business.',
    );
  }
}
