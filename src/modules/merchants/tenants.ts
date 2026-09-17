/**
 * Merchant (tenant) lifecycle - platform-admin operations.
 *
 * Merchants are never hard-deleted and their slugs are never released, so a
 * previously printed QR always resolves to something intentional.
 */
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { withSystem } from '../tenancy';
import { schema } from '../db/client';
import { recordAudit } from '../core/audit';
import { claimPrimarySlug, suggestSlug } from './slugs';
import { generateQrToken } from '../qr';
import { isValidTimeZone } from '../core/time';

export type TenantStatus = 'draft' | 'active' | 'suspended' | 'deleted';

export type CreateTenantInput = {
  displayName: string;
  categoryId: string;
  slug?: string;
  phone?: string | null;
  city?: string | null;
  timezone?: string;
  ownerPhone?: string | null;
  actorUserId: string;
};

export async function createTenant(input: CreateTenantInput): Promise<{
  tenantId: string;
  slug: string;
  qrToken: string;
}> {
  const timezone = input.timezone ?? 'Asia/Kolkata';
  if (!isValidTimeZone(timezone)) throw new Error(`Unknown timezone: ${timezone}`);

  const slug = input.slug ?? (await suggestSlug(input.displayName, input.city));

  const result = await withSystem(async ({ tx }) => {
    const [tenant] = await tx
      .insert(schema.tenants)
      .values({
        displayName: input.displayName.trim(),
        categoryId: input.categoryId,
        timezone,
        status: 'draft',
      })
      .returning();
    if (!tenant) throw new Error('Failed to create merchant');

    await claimPrimarySlug(tx, tenant.id, slug);

    await tx.insert(schema.businessProfiles).values({
      tenantId: tenant.id,
      phone: input.phone ?? null,
      whatsapp: input.phone ?? null,
      city: input.city ?? null,
    });

    const [category] = await tx
      .select({ aiEnabledByDefault: schema.categories.aiEnabledByDefault })
      .from(schema.categories)
      .where(eq(schema.categories.id, input.categoryId))
      .limit(1);

    await tx.insert(schema.aiConfigs).values({
      tenantId: tenant.id,
      // Off by default for high-liability verticals such as medical.
      isEnabled: category?.aiEnabledByDefault ?? false,
    });

    const qrToken = generateQrToken();
    await tx.insert(schema.qrCodes).values({ tenantId: tenant.id, token: qrToken, label: 'Main' });

    // Sensible default hours so a new merchant is not staring at an empty form.
    await tx.insert(schema.businessHours).values(
      [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        tenantId: tenant.id,
        dayOfWeek,
        opensAt: '10:00:00',
        closesAt: '20:00:00',
        isClosed: false,
      })),
    );

    if (input.ownerPhone) {
      const phone = input.ownerPhone;
      let [user] = await tx.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
      if (!user) [user] = await tx.insert(schema.users).values({ phone }).returning();
      if (user) {
        await tx
          .insert(schema.memberships)
          .values({ userId: user.id, tenantId: tenant.id, role: 'owner' });
      }
    }

    return { tenantId: tenant.id, slug, qrToken };
  });

  await recordAudit({
    action: 'tenant.create',
    actorUserId: input.actorUserId,
    actorType: 'platform',
    tenantId: result.tenantId,
    entityType: 'tenant',
    entityId: result.tenantId,
    after: { displayName: input.displayName, slug: result.slug },
  });

  return result;
}

export async function setTenantStatus(args: {
  tenantId: string;
  status: Exclude<TenantStatus, 'draft'>;
  actorUserId: string;
  reason?: string;
}): Promise<void> {
  const before = await getTenant(args.tenantId);
  await withSystem(({ tx }) =>
    tx
      .update(schema.tenants)
      .set({
        status: args.status,
        deletedAt: args.status === 'deleted' ? new Date() : null,
      })
      .where(eq(schema.tenants.id, args.tenantId)),
  );

  const action =
    args.status === 'suspended'
      ? 'tenant.suspend'
      : args.status === 'deleted'
        ? 'tenant.delete'
        : 'tenant.activate';

  await recordAudit({
    action,
    actorUserId: args.actorUserId,
    actorType: 'platform',
    tenantId: args.tenantId,
    entityType: 'tenant',
    entityId: args.tenantId,
    before: { status: before?.status },
    after: { status: args.status, reason: args.reason ?? null },
  });
}

export async function publishTenant(tenantId: string, actorUserId: string): Promise<void> {
  await withSystem(({ tx }) =>
    tx
      .update(schema.tenants)
      .set({ publishedAt: new Date(), status: 'active' })
      .where(eq(schema.tenants.id, tenantId)),
  );
  await recordAudit({
    action: 'tenant.publish',
    actorUserId,
    actorType: 'merchant',
    tenantId,
    entityType: 'tenant',
    entityId: tenantId,
  });
}

export async function unpublishTenant(tenantId: string, actorUserId: string): Promise<void> {
  await withSystem(({ tx }) =>
    tx.update(schema.tenants).set({ publishedAt: null }).where(eq(schema.tenants.id, tenantId)),
  );
  await recordAudit({
    action: 'tenant.unpublish',
    actorUserId,
    actorType: 'merchant',
    tenantId,
    entityType: 'tenant',
    entityId: tenantId,
  });
}

export async function getTenant(tenantId: string) {
  return withSystem(async ({ tx }) => {
    const [row] = await tx.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
    return row ?? null;
  });
}

export type TenantListItem = {
  id: string;
  displayName: string;
  status: TenantStatus;
  slug: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  categoryName: string | null;
};

export async function listTenants(options: {
  query?: string;
  status?: TenantStatus;
  limit?: number;
  offset?: number;
} = {}): Promise<TenantListItem[]> {
  const limit = Math.min(options.limit ?? 50, 200);
  return withSystem(async ({ tx }) => {
    const conditions = [];
    if (options.status) conditions.push(eq(schema.tenants.status, options.status));
    if (options.query) {
      conditions.push(
        or(
          ilike(schema.tenants.displayName, `%${options.query}%`),
          ilike(schema.merchantSlugs.slug, `%${options.query}%`),
        ),
      );
    }

    const rows = await tx
      .select({
        id: schema.tenants.id,
        displayName: schema.tenants.displayName,
        status: schema.tenants.status,
        slug: schema.merchantSlugs.slug,
        publishedAt: schema.tenants.publishedAt,
        createdAt: schema.tenants.createdAt,
        categoryName: schema.categories.name,
      })
      .from(schema.tenants)
      .leftJoin(
        schema.merchantSlugs,
        and(
          eq(schema.merchantSlugs.tenantId, schema.tenants.id),
          eq(schema.merchantSlugs.isPrimary, true),
        ),
      )
      .leftJoin(schema.categories, eq(schema.categories.id, schema.tenants.categoryId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(schema.tenants.createdAt))
      .limit(limit)
      .offset(options.offset ?? 0);

    return rows as TenantListItem[];
  });
}

/** Activation funnel for the platform dashboard. */
export async function platformStats(): Promise<{
  total: number;
  active: number;
  published: number;
  draft: number;
  suspended: number;
}> {
  return withSystem(async ({ tx }) => {
    const [row] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) FILTER (WHERE ${schema.tenants.status} = 'active')::int`,
        published: sql<number>`count(*) FILTER (WHERE ${schema.tenants.publishedAt} IS NOT NULL)::int`,
        draft: sql<number>`count(*) FILTER (WHERE ${schema.tenants.status} = 'draft')::int`,
        suspended: sql<number>`count(*) FILTER (WHERE ${schema.tenants.status} = 'suspended')::int`,
      })
      .from(schema.tenants)
      .where(isNull(schema.tenants.deletedAt));
    return row ?? { total: 0, active: 0, published: 0, draft: 0, suspended: 0 };
  });
}
