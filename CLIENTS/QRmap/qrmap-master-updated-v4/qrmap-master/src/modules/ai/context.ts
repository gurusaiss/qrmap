/**
 * Structured context injection - the alternative to RAG (decision D16).
 *
 * A merchant's entire knowledge base is 1,500-4,000 tokens, so there is nothing
 * to retrieve. We serialise that ONE tenant's rows, fetched by a single
 * tenant-scoped query, straight into the prompt.
 *
 * The security consequence is the important part: the model is never shown data
 * belonging to more than one tenant, so cross-tenant leakage is not "unlikely",
 * it is unreachable. No similarity search can drift across a boundary that the
 * query never crosses.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import { withTenant } from '../tenancy';
import { schema } from '../db/client';
import { formatPriceRange } from '../core/money';
import { evaluateOpenState, formatWeek, type HoursRow } from '../core/hours';
import { isPubliclyVisible, offerStatus } from '../core/offers';

export const MAX_CONTEXT_CHARS = 12_000;

export type TenantContext = {
  text: string;
  contextVersion: number;
  timezone: string;
  displayName: string;
  truncated: boolean;
};

/**
 * Builds the merchant's knowledge block. Everything here comes from a single
 * `withTenant` scope; there is no code path that reads another tenant.
 */
export async function buildTenantContext(tenantId: string, now = new Date()): Promise<TenantContext | null> {
  return withTenant(tenantId, async ({ tx }) => {
    const [tenant] = await tx
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);
    if (!tenant) return null;

    const [profile] = await tx
      .select()
      .from(schema.businessProfiles)
      .where(eq(schema.businessProfiles.tenantId, tenantId))
      .limit(1);

    const hourRows = await tx
      .select()
      .from(schema.businessHours)
      .where(eq(schema.businessHours.tenantId, tenantId));

    const holidays = await tx
      .select()
      .from(schema.businessHolidays)
      .where(eq(schema.businessHolidays.tenantId, tenantId));

    const items = await tx
      .select()
      .from(schema.catalogItems)
      .where(
        and(
          eq(schema.catalogItems.tenantId, tenantId),
          eq(schema.catalogItems.isAvailable, true),
          isNull(schema.catalogItems.deletedAt),
        ),
      )
      .orderBy(asc(schema.catalogItems.sortOrder));

    const offerRows = await tx
      .select()
      .from(schema.offers)
      .where(
        and(
          eq(schema.offers.tenantId, tenantId),
          eq(schema.offers.isPublished, true),
          isNull(schema.offers.deletedAt),
        ),
      );

    const hours: HoursRow[] = hourRows.map((r) => ({
      dayOfWeek: r.dayOfWeek,
      opensAt: r.opensAt,
      closesAt: r.closesAt,
      isClosed: r.isClosed,
    }));

    const openState = evaluateOpenState(
      hours,
      holidays.map((h) => ({ date: h.date, label: h.label })),
      now,
      tenant.timezone,
    );

    const activeOffers = offerRows.filter((row) =>
      isPubliclyVisible(
        offerStatus(
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
        ),
      ),
    );

    const lines: string[] = [];
    lines.push(`BUSINESS NAME: ${tenant.displayName}`);
    if (profile?.tagline) lines.push(`TAGLINE: ${profile.tagline}`);
    if (profile?.description) lines.push(`ABOUT: ${profile.description}`);

    const address = [profile?.addressLine1, profile?.addressLine2, profile?.city, profile?.state, profile?.pincode]
      .filter(Boolean)
      .join(', ');
    if (address) lines.push(`ADDRESS: ${address}`);
    if (profile?.phone) lines.push(`PHONE: ${profile.phone}`);
    if (profile?.whatsapp) lines.push(`WHATSAPP: ${profile.whatsapp}`);
    if (profile?.websiteUrl) lines.push(`WEBSITE: ${profile.websiteUrl}`);

    lines.push(
      `CURRENTLY: ${openState.open ? `Open now, closes at ${openState.closesAt}` : `Closed now${'opensNext' in openState && openState.opensNext ? `. ${openState.opensNext}` : ''}`}`,
    );

    lines.push('OPENING HOURS:');
    for (const day of formatWeek(hours)) {
      lines.push(`  ${day.day}: ${day.windows.length ? day.windows.join(', ') : 'Closed'}`);
    }

    const services = items.filter((i) => i.kind === 'service');
    const products = items.filter((i) => i.kind === 'product');

    if (services.length) {
      lines.push('SERVICES AND PRICES:');
      for (const s of services) {
        const price = formatPriceRange(s.priceMinor, s.priceMaxMinor, s.priceUnit);
        const duration = s.durationMinutes ? `, about ${s.durationMinutes} minutes` : '';
        lines.push(`  - ${s.name}: ${price}${duration}${s.description ? ` (${s.description})` : ''}`);
      }
    }

    if (products.length) {
      lines.push('PRODUCTS AND PRICES:');
      for (const p of products) {
        const price = formatPriceRange(p.priceMinor, p.priceMaxMinor, p.priceUnit);
        const moq = p.minOrderQty ? `, minimum order ${p.minOrderQty}` : '';
        const stock = p.stockStatus && p.stockStatus !== 'in_stock' ? `, ${p.stockStatus.replace('_', ' ')}` : '';
        lines.push(`  - ${p.name}: ${price}${moq}${stock}`);
      }
    }

    if (activeOffers.length) {
      lines.push('CURRENT OFFERS:');
      for (const o of activeOffers) {
        const code = o.couponCode ? ` Use code ${o.couponCode}.` : '';
        lines.push(`  - ${o.title}${o.description ? `: ${o.description}` : ''}.${code}`);
      }
    } else {
      lines.push('CURRENT OFFERS: none running right now.');
    }

    const full = lines.join('\n');
    const truncated = full.length > MAX_CONTEXT_CHARS;

    return {
      text: truncated ? `${full.slice(0, MAX_CONTEXT_CHARS)}\n[truncated]` : full,
      contextVersion: tenant.contextVersion,
      timezone: tenant.timezone,
      displayName: tenant.displayName,
      truncated,
    };
  });
}
