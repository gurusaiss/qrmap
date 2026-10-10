/**
 * Platform-wide configuration: categories, plans, feature flags.
 *
 * Wires up `platform:categories:write`, `platform:plans:write` and
 * `platform:flags:write`, which RBAC has defined since the beginning but
 * which had no admin UI to actually exercise them.
 */
import { asc, desc, eq } from 'drizzle-orm';
import { withSystem } from '../tenancy';
import { schema } from '../db/client';
import { recordAudit } from '../core/audit';

export type CategoryInput = {
  slug: string;
  name: string;
  templateKey: string;
  aiEnabledByDefault: boolean;
  sortOrder: number;
};

export async function listCategories() {
  return withSystem(({ tx }) => tx.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder)));
}

export async function createCategory(input: CategoryInput, actorUserId: string) {
  const [row] = await withSystem(({ tx }) => tx.insert(schema.categories).values(input).returning());
  await recordAudit({
    action: 'tenant.update',
    actorUserId,
    actorType: 'platform',
    entityType: 'category',
    entityId: row?.id,
    after: input,
  });
  return row;
}

export async function updateCategory(id: string, input: Partial<CategoryInput>, actorUserId: string) {
  const [row] = await withSystem(({ tx }) =>
    tx.update(schema.categories).set(input).where(eq(schema.categories.id, id)).returning(),
  );
  await recordAudit({
    action: 'tenant.update',
    actorUserId,
    actorType: 'platform',
    entityType: 'category',
    entityId: id,
    after: input,
  });
  return row;
}

export type PlanInput = {
  key: string;
  name: string;
  priceMinor: number;
  currency: string;
  interval: string;
  limits: Record<string, number>;
  features: Record<string, boolean | string>;
  isPublic: boolean;
  sortOrder: number;
};

export async function listPlans() {
  return withSystem(({ tx }) => tx.select().from(schema.plans).orderBy(asc(schema.plans.sortOrder)));
}

export async function updatePlan(id: string, input: Partial<PlanInput>, actorUserId: string) {
  const [row] = await withSystem(({ tx }) =>
    tx.update(schema.plans).set(input).where(eq(schema.plans.id, id)).returning(),
  );
  await recordAudit({
    action: 'plan.change',
    actorUserId,
    actorType: 'platform',
    entityType: 'plan',
    entityId: id,
    after: input,
  });
  return row;
}

export async function listFeatureFlags() {
  return withSystem(({ tx }) => tx.select().from(schema.featureFlags).orderBy(asc(schema.featureFlags.key)));
}

export async function setFeatureFlag(key: string, defaultEnabled: boolean, actorUserId: string) {
  await withSystem(({ tx }) =>
    tx.update(schema.featureFlags).set({ defaultEnabled }).where(eq(schema.featureFlags.key, key)),
  );
  await recordAudit({
    action: 'tenant.update',
    actorUserId,
    actorType: 'platform',
    entityType: 'feature_flag',
    entityId: key,
    after: { defaultEnabled },
  });
}

export type AuditEntry = {
  id: string;
  action: string;
  actorUserId: string | null;
  actorType: string;
  tenantId: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
};

export async function listAuditLog(options: { limit?: number } = {}): Promise<AuditEntry[]> {
  return withSystem(({ tx }) =>
    tx
      .select({
        id: schema.auditLogs.id,
        action: schema.auditLogs.action,
        actorUserId: schema.auditLogs.actorUserId,
        actorType: schema.auditLogs.actorType,
        tenantId: schema.auditLogs.tenantId,
        entityType: schema.auditLogs.entityType,
        entityId: schema.auditLogs.entityId,
        createdAt: schema.auditLogs.createdAt,
      })
      .from(schema.auditLogs)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(Math.min(options.limit ?? 100, 500)),
  );
}
