/**
 * Plan + usage for a tenant. Wires up the `billing:read` permission, which
 * previously had no UI surface at all.
 *
 * There is no payment gateway integrated yet (docs/02-PRODUCT-SPEC.md §4
 * explicitly defers billing past V1), so this is deliberately READ-ONLY: it
 * shows the merchant their current plan, its limits, and live usage against
 * those limits. An "upgrade" action here would be a lie if it didn't
 * actually charge anyone — better to show accurate information and a contact
 * path than a fake working button.
 */
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { withSystem, withTenant } from '../tenancy';
import { schema } from '../db/client';

export type PlanLimits = {
  catalogItems?: number;
  activeOffers?: number;
  mediaMb?: number;
  aiQuestionsPerMonth?: number;
  branches?: number;
};

export type PlanFeatures = {
  analytics?: 'basic' | 'full';
  ai?: boolean;
  removeBranding?: boolean;
  website?: boolean;
  leadInbox?: boolean;
  staff?: boolean;
};

export type PlanInfo = {
  key: string;
  name: string;
  priceMinor: number;
  currency: string;
  interval: string;
  limits: PlanLimits;
  features: PlanFeatures;
};

export type PlanUsage = {
  catalogItems: number;
  activeOffers: number;
  mediaBytes: number;
  aiQuestionsThisMonth: number;
};

export async function getCurrentPlan(tenantId: string): Promise<PlanInfo | null> {
  return withSystem(async ({ tx }) => {
    const [row] = await tx
      .select({ plan: schema.plans })
      .from(schema.tenants)
      .innerJoin(schema.plans, eq(schema.plans.id, schema.tenants.planId))
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);
    if (!row) return null;
    return {
      key: row.plan.key,
      name: row.plan.name,
      priceMinor: row.plan.priceMinor,
      currency: row.plan.currency,
      interval: row.plan.interval,
      limits: row.plan.limits as PlanLimits,
      features: row.plan.features as PlanFeatures,
    };
  });
}

/** The free plan is the default for a tenant with no plan assigned yet. */
export async function getFreePlan(): Promise<PlanInfo | null> {
  return withSystem(async ({ tx }) => {
    const [row] = await tx.select().from(schema.plans).where(eq(schema.plans.key, 'free')).limit(1);
    if (!row) return null;
    return {
      key: row.key,
      name: row.name,
      priceMinor: row.priceMinor,
      currency: row.currency,
      interval: row.interval,
      limits: row.limits as PlanLimits,
      features: row.features as PlanFeatures,
    };
  });
}

export async function listPublicPlans(): Promise<PlanInfo[]> {
  return withSystem(async ({ tx }) => {
    const rows = await tx
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.isPublic, true))
      .orderBy(schema.plans.sortOrder);
    return rows.map((row) => ({
      key: row.key,
      name: row.name,
      priceMinor: row.priceMinor,
      currency: row.currency,
      interval: row.interval,
      limits: row.limits as PlanLimits,
      features: row.features as PlanFeatures,
    }));
  });
}

export async function getUsage(tenantId: string): Promise<PlanUsage> {
  return withTenant(tenantId, async ({ tx }) => {
    const [catalogCount] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.catalogItems)
      .where(and(eq(schema.catalogItems.tenantId, tenantId), isNull(schema.catalogItems.deletedAt)));

    const [offerCount] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.offers)
      .where(
        and(
          eq(schema.offers.tenantId, tenantId),
          eq(schema.offers.isPublished, true),
          isNull(schema.offers.deletedAt),
        ),
      );

    const [mediaBytes] = await tx
      .select({ total: sql<number>`coalesce(sum(${schema.media.bytes}), 0)::bigint` })
      .from(schema.media)
      .where(and(eq(schema.media.tenantId, tenantId), isNull(schema.media.deletedAt)));

    const since = new Date();
    since.setDate(1);
    since.setHours(0, 0, 0, 0);
    const [aiCount] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.aiMessages)
      .where(
        and(
          eq(schema.aiMessages.tenantId, tenantId),
          eq(schema.aiMessages.role, 'assistant'),
          eq(schema.aiMessages.answerSource, 'model'),
          gte(schema.aiMessages.createdAt, since),
        ),
      );

    return {
      catalogItems: catalogCount?.n ?? 0,
      activeOffers: offerCount?.n ?? 0,
      mediaBytes: Number(mediaBytes?.total ?? 0),
      aiQuestionsThisMonth: aiCount?.n ?? 0,
    };
  });
}
