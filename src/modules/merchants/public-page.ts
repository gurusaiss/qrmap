/**
 * Public page assembly.
 *
 * The tenant is resolved from the URL slug server-side and then every query
 * runs inside that tenant's scope. Offer status and open/closed state are
 * computed here, at read time, in the shop's own timezone.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import { withTenant } from '../tenancy';
import { schema } from '../db/client';
import { evaluateOpenState, formatWeek, type HoursRow, type OpenState } from '../core/hours';
import { isPubliclyVisible, offerStatus, describeValidity, type OfferStatus } from '../core/offers';
import { resolveSlug } from './slugs';
import { effectiveFeatureEnabled } from '../platform/features';

export type PublicOffer = {
  id: string;
  title: string;
  description: string | null;
  terms: string | null;
  couponCode: string | null;
  discountType: 'percent' | 'flat' | 'bogo' | 'custom';
  discountPercent: number | null;
  discountValueMinor: number | null;
  ctaType: 'none' | 'call' | 'whatsapp' | 'directions' | 'link';
  ctaValue: string | null;
  mediaId: string | null;
  validity: string;
  status: OfferStatus;
  isFeatured: boolean;
};

export type PublicCatalogItem = {
  id: string;
  kind: 'service' | 'product';
  name: string;
  description: string | null;
  priceMinor: number | null;
  priceMaxMinor: number | null;
  priceUnit: string | null;
  compareAtMinor: number | null;
  durationMinutes: number | null;
  stockStatus: string | null;
  minOrderQty: number | null;
  bulkTiers: { minQty: number; priceMinor: number }[];
  mediaId: string | null;
  isFeatured: boolean;
};

export type PublicPageData = {
  tenantId: string;
  slug: string;
  displayName: string;
  templateKey: string;
  categoryName: string | null;
  currency: 'INR';
  timezone: string;
  profile: {
    tagline: string | null;
    description: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    websiteUrl: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    googleMapsUrl: string | null;
    gbpReviewUrl: string | null;
    accentColor: string | null;
    socials: Record<string, string>;
    logoMediaId: string | null;
    coverMediaId: string | null;
  };
  openState: OpenState;
  week: { day: string; dayOfWeek: number; windows: string[] }[];
  heroOffer: PublicOffer | null;
  offers: PublicOffer[];
  services: PublicCatalogItem[];
  products: PublicCatalogItem[];
  gallery: { id: string; altText: string | null; variants: Record<string, string> }[];
  aiEnabled: boolean;
};

export type PublicPageResult =
  | { kind: 'ok'; data: PublicPageData }
  | { kind: 'redirect'; toSlug: string }
  | { kind: 'coming_soon'; displayName: string }
  | { kind: 'suspended'; displayName: string }
  | { kind: 'gone'; displayName: string }
  | { kind: 'not_found' };

export async function loadPublicPage(slug: string, now = new Date()): Promise<PublicPageResult> {
  const resolution = await resolveSlug(slug);
  if (resolution.kind === 'unknown') return { kind: 'not_found' };
  if (resolution.kind === 'alias') return { kind: 'redirect', toSlug: resolution.canonicalSlug };

  const { tenantId } = resolution;

  return withTenant(tenantId, async ({ tx }) => {
    const [tenant] = await tx
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);
    if (!tenant) return { kind: 'not_found' };

    // A printed QR must never produce a 404 or point at someone else. Every
    // lifecycle state gets an intentional, branded page.
    if (tenant.status === 'deleted') return { kind: 'gone', displayName: tenant.displayName };
    if (tenant.status === 'suspended') return { kind: 'suspended', displayName: tenant.displayName };
    if (!tenant.publishedAt) return { kind: 'coming_soon', displayName: tenant.displayName };

    const [profile] = await tx
      .select()
      .from(schema.businessProfiles)
      .where(eq(schema.businessProfiles.tenantId, tenantId))
      .limit(1);

    const [category] = tenant.categoryId
      ? await tx
          .select({ name: schema.categories.name, templateKey: schema.categories.templateKey })
          .from(schema.categories)
          .where(eq(schema.categories.id, tenant.categoryId))
          .limit(1)
      : [undefined];

    const hourRows = await tx
      .select()
      .from(schema.businessHours)
      .where(eq(schema.businessHours.tenantId, tenantId));

    const holidayRows = await tx
      .select()
      .from(schema.businessHolidays)
      .where(eq(schema.businessHolidays.tenantId, tenantId));

    const offerRows = await tx
      .select()
      .from(schema.offers)
      .where(
        and(
          eq(schema.offers.tenantId, tenantId),
          eq(schema.offers.isPublished, true),
          isNull(schema.offers.deletedAt),
        ),
      )
      .orderBy(asc(schema.offers.sortOrder), asc(schema.offers.createdAt));

    const catalogRows = await tx
      .select()
      .from(schema.catalogItems)
      .where(
        and(
          eq(schema.catalogItems.tenantId, tenantId),
          eq(schema.catalogItems.isAvailable, true),
          isNull(schema.catalogItems.deletedAt),
        ),
      )
      .orderBy(asc(schema.catalogItems.sortOrder), asc(schema.catalogItems.createdAt));

    const galleryRows = await tx
      .select({ id: schema.media.id, altText: schema.media.altText, variants: schema.media.variants })
      .from(schema.media)
      .where(
        and(
          eq(schema.media.tenantId, tenantId),
          eq(schema.media.kind, 'gallery'),
          isNull(schema.media.deletedAt),
        ),
      )
      .orderBy(asc(schema.media.sortOrder));

    const [aiConfig] = await tx
      .select()
      .from(schema.aiConfigs)
      .where(eq(schema.aiConfigs.tenantId, tenantId))
      .limit(1);

    const [aiOverride] = await tx
      .select({ enabled: schema.tenantFeatureOverrides.enabled })
      .from(schema.tenantFeatureOverrides)
      .where(
        and(
          eq(schema.tenantFeatureOverrides.tenantId, tenantId),
          eq(schema.tenantFeatureOverrides.flagKey, 'ai_assistant'),
        ),
      )
      .limit(1);

    const hours: HoursRow[] = hourRows.map((r) => ({
      dayOfWeek: r.dayOfWeek,
      opensAt: r.opensAt,
      closesAt: r.closesAt,
      isClosed: r.isClosed,
    }));

    const visibleOffers: PublicOffer[] = offerRows
      .map((row) => {
        const status = offerStatus(
          {
            isPublished: row.isPublished,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            dailyStartTime: row.dailyStartTime,
            dailyEndTime: row.dailyEndTime,
            activeWeekdays: row.activeWeekdays,
          },
          now,
          tenant.timezone,
        );
        return { row, status };
      })
      .filter(({ status }) => isPubliclyVisible(status))
      .map(({ row, status }) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        terms: row.terms,
        couponCode: row.couponCode,
        discountType: row.discountType,
        discountPercent: row.discountPercent,
        discountValueMinor: row.discountValueMinor,
        ctaType: row.ctaType,
        ctaValue: row.ctaValue,
        mediaId: row.mediaId,
        status,
        isFeatured: row.isFeatured,
        validity: describeValidity(
          {
            isPublished: row.isPublished,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            dailyStartTime: row.dailyStartTime,
            dailyEndTime: row.dailyEndTime,
            activeWeekdays: row.activeWeekdays,
          },
          status,
        ),
      }));

    // At most ONE hero offer: the first screen must not become a list.
    const heroOffer = visibleOffers.find((o) => o.isFeatured) ?? visibleOffers[0] ?? null;
    const restOffers = visibleOffers.filter((o) => o.id !== heroOffer?.id);

    const toPublicItem = (row: (typeof catalogRows)[number]): PublicCatalogItem => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      description: row.description,
      priceMinor: row.priceMinor,
      priceMaxMinor: row.priceMaxMinor,
      priceUnit: row.priceUnit,
      compareAtMinor: row.compareAtMinor,
      durationMinutes: row.durationMinutes,
      stockStatus: row.stockStatus,
      minOrderQty: row.minOrderQty,
      bulkTiers: (row.bulkTiers as { minQty: number; priceMinor: number }[]) ?? [],
      mediaId: row.mediaId,
      isFeatured: row.isFeatured,
    });

    const data: PublicPageData = {
      tenantId,
      slug: resolution.slug,
      displayName: tenant.displayName,
      templateKey: category?.templateKey ?? 'generic',
      categoryName: category?.name ?? null,
      currency: 'INR',
      timezone: tenant.timezone,
      profile: {
        tagline: profile?.tagline ?? null,
        description: profile?.description ?? null,
        phone: profile?.phone ?? null,
        whatsapp: profile?.whatsapp ?? null,
        email: profile?.email ?? null,
        websiteUrl: profile?.websiteUrl ?? null,
        addressLine1: profile?.addressLine1 ?? null,
        addressLine2: profile?.addressLine2 ?? null,
        city: profile?.city ?? null,
        state: profile?.state ?? null,
        pincode: profile?.pincode ?? null,
        googleMapsUrl: profile?.googleMapsUrl ?? null,
        gbpReviewUrl: profile?.gbpReviewUrl ?? null,
        accentColor: profile?.accentColor ?? null,
        socials: (profile?.socials as Record<string, string>) ?? {},
        logoMediaId: profile?.logoMediaId ?? null,
        coverMediaId: profile?.coverMediaId ?? null,
      },
      openState: evaluateOpenState(
        hours,
        holidayRows.map((h) => ({ date: h.date, label: h.label })),
        now,
        tenant.timezone,
      ),
      week: formatWeek(hours),
      heroOffer,
      offers: restOffers,
      services: catalogRows.filter((r) => r.kind === 'service').map(toPublicItem),
      products: catalogRows.filter((r) => r.kind === 'product').map(toPublicItem),
      gallery: galleryRows.map((g) => ({ ...g, variants: (g.variants ?? {}) as Record<string, string> })),
      aiEnabled: effectiveFeatureEnabled(aiConfig?.isEnabled ?? false, aiOverride ? { ...aiOverride, flagKey: 'ai_assistant' } : undefined),
    };

    return { kind: 'ok', data };
  });
}
