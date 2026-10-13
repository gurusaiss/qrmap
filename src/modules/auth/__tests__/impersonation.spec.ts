import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { withSystem } from '../../tenancy';
import { closeDb, schema } from '../../db/client';
import { principalFromSession, resolveSession, startImpersonation } from '../service';

const CTX = { ip: '127.0.0.1', userAgent: 'vitest' };
const ACTOR_ADMIN_USER_ID = '00000000-0000-4000-8000-0000000000f3';
const DISPLAY_NAME_PREFIX = 'impersonation-spec-tenant-';

async function createTenant(): Promise<string> {
  const [tenant] = await withSystem(({ tx }) =>
    tx.insert(schema.tenants).values({ displayName: `${DISPLAY_NAME_PREFIX}${randomUUID()}` }).returning({ id: schema.tenants.id }),
  );
  return tenant!.id;
}

async function createTenantWithOwner(): Promise<{ tenantId: string; ownerUserId: string }> {
  const tenantId = await createTenant();
  const ownerUserId = await withSystem(async ({ tx }) => {
    const [user] = await tx.insert(schema.users).values({ phone: `+9190000${randomUUID().slice(0, 5)}` }).returning({ id: schema.users.id });
    await tx.insert(schema.memberships).values({ userId: user!.id, tenantId, role: 'owner' });
    return user!.id;
  });
  return { tenantId, ownerUserId };
}

afterAll(async () => {
  // Tenants are never hard-deleted by design (no DELETE grant exists for
  // anyone) - the test tenants and users this file created are left behind,
  // same convention as features.spec.ts / domain-notice.spec.ts.
  await closeDb();
});

describe('startImpersonation', () => {
  it("signs the admin in as the tenant's owner, flagged as an impersonated session", async () => {
    const { tenantId, ownerUserId } = await createTenantWithOwner();

    const { token } = await startImpersonation({
      tenantId,
      actorAdminUserId: ACTOR_ADMIN_USER_ID,
      context: CTX,
    });

    const session = await resolveSession(token);
    expect(session?.userId).toBe(ownerUserId);
    expect(session?.activeTenantId).toBe(tenantId);
    expect(session?.impersonatedBy).toBe(ACTOR_ADMIN_USER_ID);

    // The resulting principal is an ordinary merchant principal - an
    // impersonated session must authorize exactly like the real owner would,
    // nothing more.
    const principal = principalFromSession(session);
    expect(principal).toEqual({ kind: 'merchant', userId: ownerUserId, tenantId, role: 'owner' });
  });

  it('refuses to impersonate a tenant that has no owner account yet', async () => {
    const tenantId = await createTenant();

    await expect(
      startImpersonation({ tenantId, actorAdminUserId: ACTOR_ADMIN_USER_ID, context: CTX }),
    ).rejects.toThrow('no owner account');
  });
});
