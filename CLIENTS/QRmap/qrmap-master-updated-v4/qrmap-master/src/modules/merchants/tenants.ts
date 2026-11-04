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
import { normalizeSlugInput } from '../core/slug';
import { generateQrToken } from '../qr';
import { isValidTimeZone } from '../core/time';
import { hashPassword } from '../auth/crypto';
import { normalisePhone } from '../auth/service';

export type TenantStatus = 'draft' | 'active' | 'suspended' | 'deleted';

/**
 * Exactly one of these two is how the merchant's owner account signs in -
 * decided by the admin asking the merchant which they'd rather use, before
 * filling in the form (docs/09). Either way, this call is the single source
 * of truth for that credential: there is no separate invite link or
 * temporary password to track.
 */
export type OwnerCredentials =
  | { method: 'email'; email: string; password: string }
  | { method: 'phone'; phone: string; pin: string };

export type CreateTenantInput = {
  displayName: string;
  categoryId: string;
  slug?: string;
  /** The business's own public contact number - unrelated to the owner's login phone below. */
  phone?: string | null;
  city?: string | null;
  timezone?: string;
  owner: OwnerCredentials;
  ownerFullName?: string | null;
  actorUserId: string;
};

export async function createTenant(input: CreateTenantInput): Promise<{
  tenantId: string;
  slug: string;
  qrToken: string;
  ownerLogin: { method: 'email'; email: string } | { method: 'phone'; phone: string };
}> {
  const timezone = input.timezone ?? 'Asia/Kolkata';
  if (!isValidTimeZone(timezone)) throw new Error(`Unknown timezone: ${timezone}`);

  // A typed web address is cleaned up the same way an auto-suggested one is
  // (lowercased, spaces/punctuation collapsed to hyphens) rather than
  // rejected outright for casing or spacing a non-technical admin would not
  // expect to matter - validateSlug (inside claimPrimarySlug) still rejects
  // what normalizing can't fix: too short, too long, or reserved.
  const slug = input.slug ? normalizeSlugInput(input.slug) : await suggestSlug(input.displayName, input.city);

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

    const ownerLogin = await createOwnerAccount(tx, tenant.id, input.owner, input.ownerFullName ?? null);

    return { tenantId: tenant.id, slug, qrToken, ownerLogin };
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

type Tx = Parameters<Parameters<typeof withSystem>[0]>[0]['tx'];

/**
 * Creates the merchant's owner user and membership with whichever credential
 * the admin collected, then returns the identifier (never the secret) for
 * displaying a "created with this login" confirmation afterward.
 */
async function createOwnerAccount(
  tx: Tx,
  tenantId: string,
  owner: OwnerCredentials,
  fullName: string | null,
): Promise<{ method: 'email'; email: string } | { method: 'phone'; phone: string }> {
  if (owner.method === 'email') {
    const email = owner.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
    if (owner.password.length < 10) throw new Error('The owner password must be at least 10 characters.');

    const [existing] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (existing) throw new Error('That email is already in use by another account.');

    const passwordHash = await hashPassword(owner.password);
    const [user] = await tx.insert(schema.users).values({ email, passwordHash, fullName }).returning({ id: schema.users.id });
    if (!user) throw new Error('Could not create the owner account.');
    await tx.insert(schema.memberships).values({ userId: user.id, tenantId, role: 'owner' });
    return { method: 'email', email };
  }

  const phone = normalisePhone(owner.phone);
  if (!phone) throw new Error('Enter a valid mobile number for the owner.');
  if (!/^\d{6}$/.test(owner.pin)) throw new Error('The owner PIN must be exactly 6 digits.');

  const [existing] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
  if (existing) throw new Error('That mobile number is already in use by another account.');

  const pinHash = await hashPassword(owner.pin);
  const [user] = await tx.insert(schema.users).values({ phone, pinHash, fullName }).returning({ id: schema.users.id });
  if (!user) throw new Error('Could not create the owner account.');
  await tx.insert(schema.memberships).values({ userId: user.id, tenantId, role: 'owner' });
  return { method: 'phone', phone };
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
