import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withSystem, withTenant } from '../../tenancy';
import { closeDb, schema } from '../../db/client';
import {
  effectiveFeatureEnabled,
  getTenantFeatureOverrides,
  isFeatureBlockedForTenant,
  setTenantFeatureBlock,
} from '../features';

const DISPLAY_NAME_PREFIX = 'features-spec-tenant-';
const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000f1';
// tenant_feature_overrides.flag_key is a real FK into feature_flags.key, so
// a test flag row has to exist there too, not just be an arbitrary string.
const FLAG_KEY = 'features_spec_test_flag';

async function createTestTenant(): Promise<string> {
  const [row] = await withSystem(({ tx }) =>
    tx.insert(schema.tenants).values({ displayName: `${DISPLAY_NAME_PREFIX}${randomUUID()}` }).returning({ id: schema.tenants.id }),
  );
  return row!.id;
}

beforeAll(async () => {
  await withSystem(({ tx }) =>
    tx.insert(schema.featureFlags).values({ key: FLAG_KEY, description: 'test flag' }).onConflictDoNothing(),
  );
});

afterAll(async () => {
  // Tenants are never hard-deleted by design (no DELETE grant exists for
  // anyone) - the test tenants this file created are left behind, same as a
  // real draft tenant would be. Deleting the flag row cascades away the
  // override rows this file created, which is the only real cleanup needed.
  await withSystem(({ tx }) => tx.delete(schema.featureFlags).where(eq(schema.featureFlags.key, FLAG_KEY)));
  await closeDb();
});

describe('effectiveFeatureEnabled', () => {
  it('is enabled when the merchant has it on and there is no override', () => {
    expect(effectiveFeatureEnabled(true, undefined)).toBe(true);
  });

  it('is disabled when the merchant has it off, override or not', () => {
    expect(effectiveFeatureEnabled(false, undefined)).toBe(false);
    expect(effectiveFeatureEnabled(false, { flagKey: FLAG_KEY, enabled: false })).toBe(false);
  });

  it('is disabled when an admin override blocks it, even though the merchant has it on', () => {
    expect(effectiveFeatureEnabled(true, { flagKey: FLAG_KEY, enabled: false })).toBe(false);
  });

  it('does not force a feature on: an override with enabled:true never overrides the merchant off-switch', () => {
    expect(effectiveFeatureEnabled(false, { flagKey: FLAG_KEY, enabled: true })).toBe(false);
  });
});

describe('admin feature overrides (real database)', () => {
  it('starts with no override, then can be blocked and unblocked', async () => {
    const tenantId = await createTestTenant();

    expect(await getTenantFeatureOverrides(tenantId)).toEqual([]);
    expect(await isFeatureBlockedForTenant(tenantId, FLAG_KEY)).toBe(false);

    await setTenantFeatureBlock(tenantId, FLAG_KEY, true, ACTOR_USER_ID);
    expect(await getTenantFeatureOverrides(tenantId)).toEqual([{ flagKey: FLAG_KEY, enabled: false }]);
    expect(await isFeatureBlockedForTenant(tenantId, FLAG_KEY)).toBe(true);

    await setTenantFeatureBlock(tenantId, FLAG_KEY, false, ACTOR_USER_ID);
    expect(await getTenantFeatureOverrides(tenantId)).toEqual([]);
    expect(await isFeatureBlockedForTenant(tenantId, FLAG_KEY)).toBe(false);
  });

  it('records an audit entry when a feature is blocked', async () => {
    const tenantId = await createTestTenant();
    await setTenantFeatureBlock(tenantId, FLAG_KEY, true, ACTOR_USER_ID);

    const [entry] = await withSystem(({ tx }) =>
      tx
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.tenantId, tenantId))
        .orderBy(schema.auditLogs.createdAt),
    );
    expect(entry?.action).toBe('tenant.feature_override_change');
    expect(entry?.entityId).toBe(FLAG_KEY);
  });

  it('a merchant cannot write its own override, even for its own tenant - only the system role can', async () => {
    const tenantId = await createTestTenant();

    const result = await withTenant(tenantId, async ({ tx }) =>
      tx.insert(schema.tenantFeatureOverrides).values({ tenantId, flagKey: FLAG_KEY, enabled: true }),
    ).catch((e: unknown) => {
      // The real Postgres reason lives on .cause, not .message - see
      // migrate.ts/seed.ts, which had this exact same gap fixed earlier.
      const cause = e instanceof Error && e.cause ? String(e.cause) : '';
      return `${e instanceof Error ? e.message : String(e)} ${cause}`;
    });

    expect(result).toMatch(/permission denied/i);
  });

  it('a merchant CAN read its own overrides (to know a feature was restricted)', async () => {
    const tenantId = await createTestTenant();
    await setTenantFeatureBlock(tenantId, FLAG_KEY, true, ACTOR_USER_ID);

    const rows = await withTenant(tenantId, ({ tx }) =>
      tx.select().from(schema.tenantFeatureOverrides).where(eq(schema.tenantFeatureOverrides.tenantId, tenantId)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.enabled).toBe(false);
  });
});
