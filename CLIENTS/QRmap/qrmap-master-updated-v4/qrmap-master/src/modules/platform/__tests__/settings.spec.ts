import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { withSystem, withTenant } from '../../tenancy';
import { appDb, closeDb, schema } from '../../db/client';
import {
  createCategory,
  listAuditLog,
  listCategories,
  listFeatureFlags,
  listPlans,
  setFeatureFlag,
  updateCategory,
  updatePlan,
} from '../settings';

const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000f7';
const tag = () => `settings-spec-${randomUUID().slice(0, 8)}`;

afterAll(async () => {
  // Categories/plans/flags this file made are removable (nothing references them).
  await withSystem(async ({ tx }) => {
    await tx.delete(schema.plans).where(eq(schema.plans.interval, 'settings-spec'));
  });
  await closeDb();
});

async function auditFor(entityType: string, entityId: string) {
  return withSystem(({ tx }) =>
    tx
      .select()
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.entityType, entityType), eq(schema.auditLogs.entityId, entityId))),
  );
}

describe('categories', () => {
  it('creates a category, lists it, and audits who did it', async () => {
    const slug = tag();
    const row = await createCategory(
      { slug, name: 'Spec Category', templateKey: 'generic', aiEnabledByDefault: false, sortOrder: 999 },
      ACTOR_USER_ID,
    );
    expect(row).toMatchObject({ slug, name: 'Spec Category', aiEnabledByDefault: false });
    expect((await listCategories()).some((c) => c.slug === slug)).toBe(true);

    const audit = await auditFor('category', row!.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorUserId: ACTOR_USER_ID, actorType: 'platform' });
  });

  it('refuses a duplicate slug', async () => {
    const slug = tag();
    const input = { slug, name: 'Dup', templateKey: 'generic', aiEnabledByDefault: false, sortOrder: 999 };
    await createCategory(input, ACTOR_USER_ID);
    await expect(createCategory(input, ACTOR_USER_ID)).rejects.toThrow();
  });

  it('updates only the fields given and audits the change', async () => {
    const row = await createCategory(
      { slug: tag(), name: 'Before', templateKey: 'generic', aiEnabledByDefault: false, sortOrder: 5 },
      ACTOR_USER_ID,
    );
    const updated = await updateCategory(row!.id, { aiEnabledByDefault: true }, ACTOR_USER_ID);
    expect(updated).toMatchObject({ name: 'Before', sortOrder: 5, aiEnabledByDefault: true });
    expect(await auditFor('category', row!.id)).toHaveLength(2);
  });

  it('lists categories in sort order', async () => {
    const rows = await listCategories();
    const orders = rows.map((c) => c.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

describe('plans', () => {
  async function newPlan() {
    const [plan] = await withSystem(({ tx }) =>
      tx
        .insert(schema.plans)
        .values({ key: tag(), name: 'Spec plan', priceMinor: 14900, interval: 'settings-spec' })
        .returning(),
    );
    return plan!;
  }

  it('changes the price and visibility, leaves the rest alone, and audits it', async () => {
    const plan = await newPlan();
    const updated = await updatePlan(plan.id, { priceMinor: 19900, isPublic: false }, ACTOR_USER_ID);
    expect(updated).toMatchObject({ key: plan.key, name: 'Spec plan', priceMinor: 19900, isPublic: false });
    expect((await listPlans()).find((p) => p.id === plan.id)?.priceMinor).toBe(19900);

    const audit = await auditFor('plan', plan.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe('plan.change');
  });

  it('updating an unknown plan changes nothing', async () => {
    const result = await updatePlan(randomUUID(), { priceMinor: 1 }, ACTOR_USER_ID);
    expect(result).toBeUndefined();
  });

  it('a merchant connection cannot write plans', async () => {
    const plan = await newPlan();
    await expect(
      appDb().update(schema.plans).set({ priceMinor: 1 }).where(eq(schema.plans.id, plan.id)),
    ).rejects.toThrow();
    const [after] = await withSystem(({ tx }) => tx.select().from(schema.plans).where(eq(schema.plans.id, plan.id)));
    expect(after?.priceMinor).toBe(14900);
  });
});

describe('feature flags', () => {
  it('flips the platform default and audits it', async () => {
    const key = tag();
    await withSystem(({ tx }) => tx.insert(schema.featureFlags).values({ key, description: 'spec', defaultEnabled: false }));

    await setFeatureFlag(key, true, ACTOR_USER_ID);
    expect((await listFeatureFlags()).find((f) => f.key === key)?.defaultEnabled).toBe(true);
    await setFeatureFlag(key, false, ACTOR_USER_ID);
    expect((await listFeatureFlags()).find((f) => f.key === key)?.defaultEnabled).toBe(false);

    const audit = await auditFor('feature_flag', key);
    expect(audit).toHaveLength(2);
    await withSystem(({ tx }) => tx.delete(schema.featureFlags).where(eq(schema.featureFlags.key, key)));
  });
});

describe('audit log listing', () => {
  it('returns newest first and caps the page size at 500', async () => {
    const entries = await listAuditLog({ limit: 5 });
    expect(entries.length).toBeLessThanOrEqual(5);
    const times = entries.map((e) => e.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect((await listAuditLog({ limit: 100000 })).length).toBeLessThanOrEqual(500);
  });

  it('a merchant connection can neither read nor forge audit rows', async () => {
    const tenantId = randomUUID();
    await expect(withTenant(tenantId, ({ tx }) => tx.select().from(schema.auditLogs))).rejects.toThrow();
    await expect(
      appDb().insert(schema.auditLogs).values({ action: 'tenant.update', actorType: 'merchant' }),
    ).rejects.toThrow();
  });
});
