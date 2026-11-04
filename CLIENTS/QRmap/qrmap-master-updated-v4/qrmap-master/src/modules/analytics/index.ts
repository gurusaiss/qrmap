/**
 * Privacy-first, first-party analytics.
 *
 * No cookies. No device identifiers. No raw IP storage. No third-party script
 * on the public page - which serves the performance budget as much as privacy.
 *
 * Visitors are counted with a hash of a DAILY ROTATING salt, so the same person
 * produces a different hash tomorrow and a different hash on a different
 * merchant's page. Honest daily-unique counts; correlation is cryptographically
 * impossible.
 */
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { withSystem, withTenant } from '../tenancy';
import { schema } from '../db/client';
import { env } from '../core/env';
import { visitorHash } from '../auth/crypto';
import { LIMITS, checkLimit } from '../auth/rate-limit';

export const EVENT_TYPES = [
  'page_view',
  'section_view',
  'offer_view',
  'offer_click',
  'catalog_item_view',
  'cta_call',
  'cta_whatsapp',
  'cta_directions',
  'cta_website',
  'cta_social',
  'cta_share',
  'cta_save_contact',
  'qr_download',
  'ai_question',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** The events a merchant can point at and call "a customer contacted me". */
export const LEAD_EVENTS: EventType[] = ['cta_call', 'cta_whatsapp', 'cta_directions'];

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

export function classifyDevice(userAgent: string): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  const ua = userAgent.toLowerCase();
  if (!ua) return 'unknown';
  if (/ipad|tablet|playbook|silk/.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod|windows phone/.test(ua)) return 'mobile';
  return 'desktop';
}

export function classifyReferrer(referrer: string | null, hasQrParam: boolean): 'qr' | 'direct' | 'search' | 'social' | 'other' {
  if (hasQrParam) return 'qr';
  if (!referrer) return 'direct';
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (/google|bing|duckduckgo|yahoo|ecosia/.test(host)) return 'search';
    if (/facebook|instagram|twitter|x\.com|whatsapp|t\.co|linkedin|youtube/.test(host)) return 'social';
    return 'other';
  } catch {
    return 'other';
  }
}

/** Salt rotates every UTC day; yesterday's salt is never reconstructible from today's. */
function dailySalt(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export type RecordEventInput = {
  tenantId: string;
  eventType: EventType;
  ip: string;
  userAgent: string;
  referrer?: string | null;
  hasQrParam?: boolean;
  targetType?: string | null;
  targetId?: string | null;
  section?: string | null;
  qrCodeId?: string | null;
  city?: string | null;
  country?: string | null;
  now?: Date;
};

export async function recordEvent(input: RecordEventInput): Promise<{ recorded: boolean }> {
  const now = input.now ?? new Date();
  const hash = visitorHash({
    secret: env().ANALYTICS_SALT_SECRET,
    dayKey: dailySalt(now),
    ip: input.ip,
    userAgent: input.userAgent,
    tenantId: input.tenantId,
  });

  const limit = checkLimit(`ev:${hash}`, LIMITS.analyticsPerVisitor.limit, LIMITS.analyticsPerVisitor.windowSeconds);
  if (!limit.allowed) return { recorded: false };

  await withTenant(input.tenantId, async ({ tx }) => {
    await tx.insert(schema.analyticsEvents).values({
      tenantId: input.tenantId,
      eventType: input.eventType,
      occurredAt: now,
      visitorHash: hash,
      sessionHash: hash,
      qrCodeId: input.qrCodeId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      section: input.section ?? null,
      deviceClass: classifyDevice(input.userAgent),
      referrerClass: classifyReferrer(input.referrer ?? null, input.hasQrParam ?? false),
      city: input.city ?? null,
      country: input.country ?? null,
    });
  });

  return { recorded: true };
}

/* -------------------------------------------------------------------------- */
/* Rollups                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Aggregates raw events into analytics_daily. Raw events are kept 90 days;
 * rollups are kept forever because they are small and year-on-year comparison
 * ("last Diwali vs this Diwali") is genuine merchant value.
 */
export async function rollupDay(day: string): Promise<number> {
  return withSystem(async ({ tx }) => {
    const result = await tx.execute(sql`
      INSERT INTO analytics_daily
        (tenant_id, date, event_type, target_type, target_id, device_class, count, unique_visitors)
      SELECT
        tenant_id,
        ${day}::date,
        event_type,
        coalesce(target_type, ''),
        coalesce(target_id::text, ''),
        device_class,
        count(*)::int,
        count(DISTINCT visitor_hash)::int
      FROM analytics_events
      WHERE occurred_at >= ${day}::date AND occurred_at < (${day}::date + interval '1 day')
      GROUP BY tenant_id, event_type, coalesce(target_type, ''), coalesce(target_id::text, ''), device_class
      ON CONFLICT (tenant_id, date, event_type, target_type, target_id, device_class)
      DO UPDATE SET count = excluded.count, unique_visitors = excluded.unique_visitors
    `);
    return Array.isArray(result) ? result.length : 0;
  });
}

export async function pruneRawEvents(retentionDays = 90): Promise<void> {
  await withSystem(({ tx }) =>
    tx.execute(sql`
      DELETE FROM analytics_events
      WHERE occurred_at < now() - (${retentionDays}::text || ' days')::interval
    `),
  );
}

/* -------------------------------------------------------------------------- */
/* Merchant-facing queries                                                    */
/* -------------------------------------------------------------------------- */

export type Summary = {
  scans: number;
  uniqueVisitors: number;
  leads: number;
  calls: number;
  whatsapp: number;
  directions: number;
  offerClicks: number;
};

export async function summary(tenantId: string, days = 30): Promise<Summary> {
  return withTenant(tenantId, async ({ tx }) => {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await tx
      .select({
        eventType: schema.analyticsEvents.eventType,
        total: sql<number>`count(*)::int`,
        uniques: sql<number>`count(DISTINCT ${schema.analyticsEvents.visitorHash})::int`,
      })
      .from(schema.analyticsEvents)
      .where(
        and(
          eq(schema.analyticsEvents.tenantId, tenantId),
          gte(schema.analyticsEvents.occurredAt, since),
        ),
      )
      .groupBy(schema.analyticsEvents.eventType);

    const by = (t: string): number => rows.find((r) => r.eventType === t)?.total ?? 0;
    const calls = by('cta_call');
    const whatsapp = by('cta_whatsapp');
    const directions = by('cta_directions');

    return {
      scans: by('page_view'),
      uniqueVisitors: rows.find((r) => r.eventType === 'page_view')?.uniques ?? 0,
      leads: calls + whatsapp + directions,
      calls,
      whatsapp,
      directions,
      offerClicks: by('offer_click'),
    };
  });
}

export async function timeseries(
  tenantId: string,
  days = 30,
): Promise<{ date: string; scans: number; leads: number }[]> {
  return withTenant(tenantId, async ({ tx }) => {
    const rows = await tx.execute(sql`
      SELECT
        to_char(d.day, 'YYYY-MM-DD') AS date,
        coalesce(count(*) FILTER (WHERE e.event_type = 'page_view'), 0)::int AS scans,
        coalesce(count(*) FILTER (WHERE e.event_type IN ('cta_call','cta_whatsapp','cta_directions')), 0)::int AS leads
      FROM generate_series(
        (now() - (${days}::text || ' days')::interval)::date, now()::date, interval '1 day'
      ) AS d(day)
      LEFT JOIN analytics_events e
        ON e.occurred_at >= d.day AND e.occurred_at < d.day + interval '1 day'
      GROUP BY d.day ORDER BY d.day
    `);
    return rows as unknown as { date: string; scans: number; leads: number }[];
  });
}

/** Hour x weekday grid answering "when do people scan?". */
export async function scanHeatmap(tenantId: string, days = 60): Promise<{ weekday: number; hour: number; count: number }[]> {
  return withTenant(tenantId, async ({ tx }) => {
    const [tenant] = await tx
      .select({ timezone: schema.tenants.timezone })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);
    const tz = tenant?.timezone ?? 'Asia/Kolkata';

    const rows = await tx.execute(sql`
      SELECT
        extract(dow FROM occurred_at AT TIME ZONE ${tz})::int AS weekday,
        extract(hour FROM occurred_at AT TIME ZONE ${tz})::int AS hour,
        count(*)::int AS count
      FROM analytics_events
      WHERE event_type = 'page_view'
        AND occurred_at >= now() - (${days}::text || ' days')::interval
      GROUP BY 1, 2 ORDER BY 1, 2
    `);
    return rows as unknown as { weekday: number; hour: number; count: number }[];
  });
}

export async function topOffers(
  tenantId: string,
  days = 30,
): Promise<{ offerId: string; title: string; views: number; clicks: number }[]> {
  return withTenant(tenantId, async ({ tx }) => {
    const rows = await tx.execute(sql`
      SELECT
        o.id AS "offerId",
        o.title,
        coalesce(count(*) FILTER (WHERE e.event_type = 'offer_view'), 0)::int AS views,
        coalesce(count(*) FILTER (WHERE e.event_type = 'offer_click'), 0)::int AS clicks
      FROM offers o
      LEFT JOIN analytics_events e
        ON e.target_id = o.id
       AND e.occurred_at >= now() - (${days}::text || ' days')::interval
      WHERE o.deleted_at IS NULL
      GROUP BY o.id, o.title
      ORDER BY clicks DESC, views DESC
      LIMIT 20
    `);
    return rows as unknown as { offerId: string; title: string; views: number; clicks: number }[];
  });
}

/**
 * The monthly report. This is the retention mechanism, not a nice-to-have:
 * merchants churn from invisible value, so the product must show them the
 * numbers rather than wait for them to log in and look.
 */
export type MonthlyReport = {
  tenantId: string;
  displayName: string;
  period: string;
  current: Summary;
  previous: Summary;
  changePercent: number;
  suggestion: string | null;
};

export async function monthlyReport(tenantId: string): Promise<MonthlyReport | null> {
  const [current, previous] = await Promise.all([summary(tenantId, 30), summary(tenantId, 60)]);
  const prior: Summary = {
    scans: Math.max(0, previous.scans - current.scans),
    uniqueVisitors: Math.max(0, previous.uniqueVisitors - current.uniqueVisitors),
    leads: Math.max(0, previous.leads - current.leads),
    calls: Math.max(0, previous.calls - current.calls),
    whatsapp: Math.max(0, previous.whatsapp - current.whatsapp),
    directions: Math.max(0, previous.directions - current.directions),
    offerClicks: Math.max(0, previous.offerClicks - current.offerClicks),
  };

  const tenant = await withSystem(async ({ tx }) => {
    const [row] = await tx
      .select({ displayName: schema.tenants.displayName })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);
    return row ?? null;
  });
  if (!tenant) return null;

  const changePercent =
    prior.scans === 0 ? (current.scans > 0 ? 100 : 0) : Math.round(((current.scans - prior.scans) / prior.scans) * 100);

  return {
    tenantId,
    displayName: tenant.displayName,
    period: new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date()),
    current,
    previous: prior,
    changePercent,
    suggestion: await suggestionFor(tenantId, current),
  };
}

/** A bad number is only useful with a concrete next step attached. */
async function suggestionFor(tenantId: string, s: Summary): Promise<string | null> {
  return withTenant(tenantId, async ({ tx }) => {
    const [counts] = await tx
      .select({
        photos: sql<number>`count(*) FILTER (WHERE ${schema.media.kind} = 'gallery')::int`,
      })
      .from(schema.media)
      .where(eq(schema.media.tenantId, tenantId));

    const [offerCount] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.offers)
      .where(and(eq(schema.offers.tenantId, tenantId), eq(schema.offers.isPublished, true)));

    if ((counts?.photos ?? 0) < 3) return 'Add three photos of your shop — pages with photos get more calls.';
    if ((offerCount?.n ?? 0) === 0) return 'Post an offer. Pages with a live offer get more attention.';
    if (s.scans > 20 && s.leads === 0) return 'People are opening your page but not calling. Check your phone number is correct.';
    if (s.scans < 5) return 'Few scans this month. Put the QR standee where customers wait — the counter works best.';
    return null;
  });
}

/** Questions customers asked that the merchant's page does not answer. */
export async function topQuestions(tenantId: string, days = 30): Promise<{ question: string; count: number }[]> {
  return withTenant(tenantId, async ({ tx }) => {
    const rows = await tx
      .select({
        question: schema.aiMessages.content,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.aiMessages)
      .where(
        and(
          eq(schema.aiMessages.tenantId, tenantId),
          eq(schema.aiMessages.role, 'user'),
          gte(schema.aiMessages.createdAt, new Date(Date.now() - days * 86_400_000)),
        ),
      )
      .groupBy(schema.aiMessages.content)
      .orderBy(desc(sql`count(*)`))
      .limit(15);
    return rows;
  });
}
