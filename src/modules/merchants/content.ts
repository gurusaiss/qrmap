/**
 * Tenant-scoped content operations.
 *
 * Every function here runs inside `withTenant`, so Postgres RLS confines each
 * statement to a single tenant regardless of what the calling code does. The
 * tenant id always originates from the authenticated session, never from the
 * request body.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withTenant } from '../tenancy';
import { schema } from '../db/client';

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .regex(/^[+]?[\d\s-]{6,20}$/, 'Enter a valid phone number')
  .nullish();

const urlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\//.test(v), 'Links must start with http:// or https://')
  .nullish();

export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  tagline: z.string().trim().max(160).nullish(),
  description: z.string().trim().max(2000).nullish(),
  phone: phoneSchema,
  whatsapp: phoneSchema,
  email: z.string().trim().email().max(200).nullish().or(z.literal('')),
  websiteUrl: urlSchema,
  addressLine1: z.string().trim().max(200).nullish(),
  addressLine2: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(100).nullish(),
  state: z.string().trim().max(100).nullish(),
  pincode: z.string().trim().max(12).nullish(),
  googleMapsUrl: urlSchema,
  gbpReviewUrl: urlSchema,
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex colour')
    .nullish(),
  socials: z.record(z.string(), z.string().max(300)).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

export const catalogItemSchema = z.object({
  kind: z.enum(['service', 'product']),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).nullish(),
  priceMinor: z.number().int().min(0).max(100_000_000).nullish(),
  priceMaxMinor: z.number().int().min(0).max(100_000_000).nullish(),
  priceUnit: z.string().trim().max(40).nullish(),
  compareAtMinor: z.number().int().min(0).max(100_000_000).nullish(),
  durationMinutes: z.number().int().min(1).max(1440).nullish(),
  sku: z.string().trim().max(60).nullish(),
  stockStatus: z.enum(['in_stock', 'low', 'out', 'made_to_order']).nullish(),
  minOrderQty: z.number().int().min(1).max(1_000_000).nullish(),
  bulkTiers: z
    .array(z.object({ minQty: z.number().int().min(1), priceMinor: z.number().int().min(0) }))
    .max(10)
    .optional(),
  groupId: z.string().uuid().nullish(),
  mediaId: z.string().uuid().nullish(),
  isAvailable: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
}).refine(
  (v) => v.priceMaxMinor == null || v.priceMinor == null || v.priceMaxMinor >= v.priceMinor,
  { message: 'Maximum price must be at least the minimum price', path: ['priceMaxMinor'] },
).refine((v) => v.durationMinutes == null || v.kind === 'service', {
  message: 'Only services have a duration',
  path: ['durationMinutes'],
});

export const catalogGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const offerSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullish(),
  terms: z.string().trim().max(1000).nullish(),
  mediaId: z.string().uuid().nullish(),
  discountType: z.enum(['percent', 'flat', 'bogo', 'custom']),
  discountValueMinor: z.number().int().min(0).nullish(),
  discountPercent: z.number().int().min(1).max(100).nullish(),
  couponCode: z.string().trim().max(40).nullish(),
  ctaType: z.enum(['none', 'call', 'whatsapp', 'directions', 'link']).optional(),
  ctaValue: z.string().trim().max(300).nullish(),
  startsAt: z.coerce.date().nullish(),
  endsAt: z.coerce.date().nullish(),
  dailyStartTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullish(),
  dailyEndTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullish(),
  activeWeekdays: z.array(z.number().int().min(0).max(6)).max(7).nullish(),
  isPublished: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
}).refine((v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt, {
  message: 'The end date must be after the start date',
  path: ['endsAt'],
});

export const hoursSchema = z.array(
  z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    opensAt: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
    closesAt: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
    isClosed: z.boolean(),
  }),
).max(21);

export type ProfileInput = z.infer<typeof profileSchema>;
export type CatalogItemInput = z.infer<typeof catalogItemSchema>;
export type CatalogGroupInput = z.infer<typeof catalogGroupSchema>;
export type OfferInput = z.infer<typeof offerSchema>;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0]['tx'];

/** Any content change invalidates the tenant's cached AI answers. */
async function bumpContextVersion(tx: Tx, tenantId: string): Promise<void> {
  await tx
    .update(schema.tenants)
    .set({ contextVersion: sql`${schema.tenants.contextVersion} + 1` })
    .where(eq(schema.tenants.id, tenantId));
}

const notDeleted = <T extends { deletedAt: unknown }>(table: T) =>
  isNull(table.deletedAt as never);

/* -------------------------------------------------------------------------- */
/* Profile & hours                                                            */
/* -------------------------------------------------------------------------- */

export async function getProfile(tenantId: string) {
  return withTenant(tenantId, async ({ tx }) => {
    const [profile] = await tx
      .select()
      .from(schema.businessProfiles)
      .where(eq(schema.businessProfiles.tenantId, tenantId))
      .limit(1);
    const [tenant] = await tx
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);
    return { profile: profile ?? null, tenant: tenant ?? null };
  });
}

export async function updateProfile(tenantId: string, input: ProfileInput): Promise<void> {
  const data = profileSchema.parse(input);
  await withTenant(tenantId, async ({ tx }) => {
    const { displayName, ...profileFields } = data;
    if (displayName) {
      await tx
        .update(schema.tenants)
        .set({ displayName })
        .where(eq(schema.tenants.id, tenantId));
    }
    const patch = Object.fromEntries(
      Object.entries(profileFields).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(patch).length > 0) {
      await tx
        .update(schema.businessProfiles)
        .set(patch as never)
        .where(eq(schema.businessProfiles.tenantId, tenantId));
    }
    await bumpContextVersion(tx, tenantId);
  });
}

export async function getHours(tenantId: string) {
  return withTenant(tenantId, async ({ tx }) => {
    const rows = await tx
      .select()
      .from(schema.businessHours)
      .where(eq(schema.businessHours.tenantId, tenantId))
      .orderBy(asc(schema.businessHours.dayOfWeek), asc(schema.businessHours.opensAt));
    const holidays = await tx
      .select()
      .from(schema.businessHolidays)
      .where(eq(schema.businessHolidays.tenantId, tenantId))
      .orderBy(asc(schema.businessHolidays.date));
    return { rows, holidays };
  });
}

export async function replaceHours(
  tenantId: string,
  input: z.infer<typeof hoursSchema>,
): Promise<void> {
  const rows = hoursSchema.parse(input);
  await withTenant(tenantId, async ({ tx }) => {
    await tx.delete(schema.businessHours).where(eq(schema.businessHours.tenantId, tenantId));
    if (rows.length > 0) {
      await tx.insert(schema.businessHours).values(rows.map((r) => ({ ...r, tenantId })));
    }
    await bumpContextVersion(tx, tenantId);
  });
}

/* -------------------------------------------------------------------------- */
/* Catalog groups - "Breads", "Cakes" - optional, items without one are just  */
/* uncategorised rather than forced into a group.                            */
/* -------------------------------------------------------------------------- */

export async function listCatalogGroups(tenantId: string) {
  return withTenant(tenantId, async ({ tx }) =>
    tx
      .select()
      .from(schema.catalogGroups)
      .where(and(eq(schema.catalogGroups.tenantId, tenantId), notDeleted(schema.catalogGroups)))
      .orderBy(asc(schema.catalogGroups.sortOrder), asc(schema.catalogGroups.createdAt)),
  );
}

export async function getCatalogGroup(tenantId: string, groupId: string) {
  return withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .select()
      .from(schema.catalogGroups)
      .where(
        and(
          eq(schema.catalogGroups.id, groupId),
          eq(schema.catalogGroups.tenantId, tenantId),
          notDeleted(schema.catalogGroups),
        ),
      )
      .limit(1);
    return row ?? null;
  });
}

export async function createCatalogGroup(tenantId: string, input: CatalogGroupInput) {
  const data = catalogGroupSchema.parse(input);
  return withTenant(tenantId, async ({ tx }) => {
    const [maxRow] = await tx
      .select({ max: sql<number>`coalesce(max(${schema.catalogGroups.sortOrder}), 0)::int` })
      .from(schema.catalogGroups)
      .where(eq(schema.catalogGroups.tenantId, tenantId));
    const [row] = await tx
      .insert(schema.catalogGroups)
      .values({ ...data, tenantId, sortOrder: (maxRow?.max ?? 0) + 1 })
      .returning();
    return row;
  });
}

export async function renameCatalogGroup(tenantId: string, groupId: string, input: CatalogGroupInput) {
  const data = catalogGroupSchema.parse(input);
  return withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .update(schema.catalogGroups)
      .set(data)
      .where(and(eq(schema.catalogGroups.id, groupId), eq(schema.catalogGroups.tenantId, tenantId)))
      .returning();
    return row ?? null;
  });
}

/** Soft-deletes the group; its items are never deleted with it, just become uncategorised. */
export async function deleteCatalogGroup(tenantId: string, groupId: string): Promise<boolean> {
  return withTenant(tenantId, async ({ tx }) => {
    await tx
      .update(schema.catalogItems)
      .set({ groupId: null })
      .where(and(eq(schema.catalogItems.groupId, groupId), eq(schema.catalogItems.tenantId, tenantId)));
    const [row] = await tx
      .update(schema.catalogGroups)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.catalogGroups.id, groupId), eq(schema.catalogGroups.tenantId, tenantId)))
      .returning({ id: schema.catalogGroups.id });
    return row !== undefined;
  });
}

/* -------------------------------------------------------------------------- */
/* Catalog                                                                    */
/* -------------------------------------------------------------------------- */

export async function listCatalog(
  tenantId: string,
  options: { includeUnavailable?: boolean; groupId?: string | null } = {},
) {
  return withTenant(tenantId, async ({ tx }) => {
    const conditions = [eq(schema.catalogItems.tenantId, tenantId), notDeleted(schema.catalogItems)];
    if (!options.includeUnavailable) conditions.push(eq(schema.catalogItems.isAvailable, true));
    if (options.groupId !== undefined) {
      conditions.push(options.groupId === null ? isNull(schema.catalogItems.groupId) : eq(schema.catalogItems.groupId, options.groupId));
    }
    return tx
      .select()
      .from(schema.catalogItems)
      .where(and(...conditions))
      .orderBy(asc(schema.catalogItems.sortOrder), asc(schema.catalogItems.createdAt));
  });
}

export async function getCatalogItem(tenantId: string, itemId: string) {
  return withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .select()
      .from(schema.catalogItems)
      .where(
        and(
          eq(schema.catalogItems.id, itemId),
          eq(schema.catalogItems.tenantId, tenantId),
          notDeleted(schema.catalogItems),
        ),
      )
      .limit(1);
    return row ?? null;
  });
}

export async function createCatalogItem(tenantId: string, input: CatalogItemInput) {
  const data = catalogItemSchema.parse(input);
  return withTenant(tenantId, async ({ tx }) => {
    const [maxRow] = await tx
      .select({ max: sql<number>`coalesce(max(${schema.catalogItems.sortOrder}), 0)::int` })
      .from(schema.catalogItems)
      .where(eq(schema.catalogItems.tenantId, tenantId));

    const [row] = await tx
      .insert(schema.catalogItems)
      .values({
        ...(data as Record<string, unknown>),
        tenantId,
        bulkTiers: data.bulkTiers ?? [],
        sortOrder: (maxRow?.max ?? 0) + 1,
      } as typeof schema.catalogItems.$inferInsert)
      .returning();
    await bumpContextVersion(tx, tenantId);
    return row;
  });
}

export async function updateCatalogItem(
  tenantId: string,
  itemId: string,
  input: Partial<CatalogItemInput>,
) {
  const data = catalogItemSchema.partial().parse(input);
  return withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .update(schema.catalogItems)
      .set(data as never)
      .where(and(eq(schema.catalogItems.id, itemId), eq(schema.catalogItems.tenantId, tenantId)))
      .returning();
    await bumpContextVersion(tx, tenantId);
    return row ?? null;
  });
}

/** Soft delete, so a mis-tap is recoverable. */
export async function deleteCatalogItem(tenantId: string, itemId: string): Promise<boolean> {
  return withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .update(schema.catalogItems)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.catalogItems.id, itemId), eq(schema.catalogItems.tenantId, tenantId)))
      .returning({ id: schema.catalogItems.id });
    await bumpContextVersion(tx, tenantId);
    return row !== undefined;
  });
}

export async function reorderCatalog(tenantId: string, orderedIds: string[]): Promise<void> {
  await withTenant(tenantId, async ({ tx }) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(schema.catalogItems)
        .set({ sortOrder: index })
        .where(and(eq(schema.catalogItems.id, id), eq(schema.catalogItems.tenantId, tenantId)));
    }
    await bumpContextVersion(tx, tenantId);
  });
}

/* -------------------------------------------------------------------------- */
/* Offers                                                                     */
/* -------------------------------------------------------------------------- */

export async function listOffers(tenantId: string, options: { publishedOnly?: boolean } = {}) {
  return withTenant(tenantId, async ({ tx }) => {
    const conditions = [eq(schema.offers.tenantId, tenantId), notDeleted(schema.offers)];
    if (options.publishedOnly) conditions.push(eq(schema.offers.isPublished, true));
    return tx
      .select()
      .from(schema.offers)
      .where(and(...conditions))
      .orderBy(asc(schema.offers.sortOrder), asc(schema.offers.createdAt));
  });
}

export async function getOffer(tenantId: string, offerId: string) {
  return withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .select()
      .from(schema.offers)
      .where(and(eq(schema.offers.id, offerId), eq(schema.offers.tenantId, tenantId), notDeleted(schema.offers)))
      .limit(1);
    return row ?? null;
  });
}

export async function createOffer(tenantId: string, input: OfferInput) {
  const data = offerSchema.parse(input);
  return withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .insert(schema.offers)
      .values({ ...(data as Record<string, unknown>), tenantId } as typeof schema.offers.$inferInsert)
      .returning();
    await bumpContextVersion(tx, tenantId);
    return row;
  });
}

export async function updateOffer(tenantId: string, offerId: string, input: Partial<OfferInput>) {
  const data = offerSchema.partial().parse(input);
  return withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .update(schema.offers)
      .set(data as never)
      .where(and(eq(schema.offers.id, offerId), eq(schema.offers.tenantId, tenantId)))
      .returning();
    await bumpContextVersion(tx, tenantId);
    return row ?? null;
  });
}

export async function deleteOffer(tenantId: string, offerId: string): Promise<boolean> {
  return withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .update(schema.offers)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.offers.id, offerId), eq(schema.offers.tenantId, tenantId)))
      .returning({ id: schema.offers.id });
    await bumpContextVersion(tx, tenantId);
    return row !== undefined;
  });
}

/* -------------------------------------------------------------------------- */
/* Media                                                                      */
/* -------------------------------------------------------------------------- */

export async function listMedia(tenantId: string) {
  return withTenant(tenantId, ({ tx }) =>
    tx
      .select()
      .from(schema.media)
      .where(and(eq(schema.media.tenantId, tenantId), notDeleted(schema.media)))
      .orderBy(asc(schema.media.sortOrder), asc(schema.media.createdAt)),
  );
}

/* -------------------------------------------------------------------------- */
/* AI assistant settings                                                      */
/* -------------------------------------------------------------------------- */

export const aiConfigSchema = z.object({
  isEnabled: z.boolean().optional(),
  extraInstructions: z.string().trim().max(2000).nullish(),
});

export type AiConfigInput = z.infer<typeof aiConfigSchema>;

export async function getAiConfig(tenantId: string) {
  return withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .select()
      .from(schema.aiConfigs)
      .where(eq(schema.aiConfigs.tenantId, tenantId))
      .limit(1);
    return row ?? null;
  });
}

export async function updateAiConfig(tenantId: string, input: AiConfigInput): Promise<void> {
  const data = aiConfigSchema.parse(input);
  const patch = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  if (Object.keys(patch).length === 0) return;
  await withTenant(tenantId, async ({ tx }) => {
    await tx.update(schema.aiConfigs).set(patch as never).where(eq(schema.aiConfigs.tenantId, tenantId));
    await bumpContextVersion(tx, tenantId);
  });
}

/* -------------------------------------------------------------------------- */
/* QR print preferences                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What a merchant wants printed around their QR code, stored in the
 * qr_codes.style column (already provisioned for exactly this, previously
 * unused). The QR code image itself never changes size or position based on
 * these - only which small text fields surround it (src/modules/qr/index.ts).
 */
export const qrFieldsSchema = z.object({
  showName: z.boolean().optional(),
  showTagline: z.boolean().optional(),
  showAddress: z.boolean().optional(),
  showPhone: z.boolean().optional(),
  callToAction: z.string().trim().max(120).nullish(),
});

export type QrFieldsInput = z.infer<typeof qrFieldsSchema>;

export async function getQrPrintPrefs(tenantId: string): Promise<QrFieldsInput> {
  return withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .select({ style: schema.qrCodes.style })
      .from(schema.qrCodes)
      .where(eq(schema.qrCodes.tenantId, tenantId))
      .limit(1);
    return (row?.style as QrFieldsInput | undefined) ?? {};
  });
}

export async function updateQrPrintPrefs(tenantId: string, input: QrFieldsInput): Promise<void> {
  const data = qrFieldsSchema.parse(input);
  await withTenant(tenantId, async ({ tx }) => {
    await tx.update(schema.qrCodes).set({ style: data as never }).where(eq(schema.qrCodes.tenantId, tenantId));
  });
}

export async function deleteMedia(tenantId: string, mediaId: string): Promise<boolean> {
  return withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .update(schema.media)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.media.id, mediaId), eq(schema.media.tenantId, tenantId)))
      .returning({ id: schema.media.id });
    await bumpContextVersion(tx, tenantId);
    return row !== undefined;
  });
}
