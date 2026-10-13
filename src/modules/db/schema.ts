/**
 * Database schema.
 *
 * Invariants enforced here (see docs/04-DATABASE.md):
 *  - Every tenant-owned table carries a non-null `tenantId`.
 *  - Child rows reference parents by COMPOSITE key (tenantId, id), so a
 *    cross-tenant reference is rejected by Postgres itself.
 *  - Money is integer minor units (paise). Never floats.
 *  - Tenant-owned rows are soft-deleted.
 *
 * RLS policies, triggers and partitions live in src/modules/db/sql/ because
 * Drizzle does not model them; they are applied by the migrate script.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const pk = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const deletedAt = () => timestamp('deleted_at', { withTimezone: true });

/* ========================================================================== */
/* Enums                                                                      */
/* ========================================================================== */

export const tenantStatus = pgEnum('tenant_status', ['draft', 'active', 'suspended', 'deleted']);
export const merchantRole = pgEnum('merchant_role', ['owner', 'manager', 'staff']);
export const platformRole = pgEnum('platform_role', ['super_admin', 'admin', 'support']);
export const userStatus = pgEnum('user_status', ['active', 'disabled']);
export const catalogKind = pgEnum('catalog_kind', ['service', 'product']);
export const stockStatus = pgEnum('stock_status', ['in_stock', 'low', 'out', 'made_to_order']);
export const discountType = pgEnum('discount_type', ['percent', 'flat', 'bogo', 'custom']);
export const ctaType = pgEnum('cta_type', ['none', 'call', 'whatsapp', 'directions', 'link']);
export const mediaKind = pgEnum('media_kind', ['logo', 'cover', 'gallery', 'catalog', 'offer']);
export const deviceClass = pgEnum('device_class', ['mobile', 'tablet', 'desktop', 'unknown']);
export const referrerClass = pgEnum('referrer_class', ['qr', 'direct', 'search', 'social', 'other']);
export const groupType = pgEnum('group_type', ['association', 'franchise', 'multi_branch', 'reseller']);
export const subscriptionStatus = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'cancelled',
]);

/* ========================================================================== */
/* Platform-level (not tenant-owned, no RLS)                                  */
/* ========================================================================== */

export const merchantGroups = pgTable('merchant_groups', {
  id: pk(),
  name: text('name').notNull(),
  type: groupType('type').notNull().default('association'),
  ownerUserId: uuid('owner_user_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const categories = pgTable(
  'categories',
  {
    id: pk(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    parentId: uuid('parent_id'),
    templateKey: text('template_key').notNull().default('generic'),
    defaultFields: jsonb('default_fields').notNull().default({}),
    /** AI is disabled by default for high-liability verticals (medical). */
    aiEnabledByDefault: boolean('ai_enabled_by_default').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('categories_slug_key').on(t.slug)],
);

export const plans = pgTable(
  'plans',
  {
    id: pk(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    priceMinor: integer('price_minor').notNull().default(0),
    currency: char('currency', { length: 3 }).notNull().default('INR'),
    interval: text('interval').notNull().default('month'),
    /** Enforced in application code so a pricing experiment is a data change. */
    limits: jsonb('limits').notNull().default({}),
    features: jsonb('features').notNull().default({}),
    isPublic: boolean('is_public').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('plans_key_key').on(t.key)],
);

export const featureFlags = pgTable(
  'feature_flags',
  {
    key: text('key').primaryKey(),
    description: text('description').notNull().default(''),
    defaultEnabled: boolean('default_enabled').notNull().default(false),
    rules: jsonb('rules').notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

/** Generic global key/value store for platform-wide settings (e.g. "we changed domains on X date"). */
export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: updatedAt(),
});

/* ========================================================================== */
/* Identity                                                                   */
/* ========================================================================== */

/** A user is NOT tenant-scoped: one person may own several shops. */
export const users = pgTable(
  'users',
  {
    id: pk(),
    phone: text('phone'),
    email: text('email'),
    passwordHash: text('password_hash'),
    totpSecret: text('totp_secret'),
    /** Static 6-digit PIN, platform-admin second factor (see docs/09 for why this replaced TOTP). */
    adminPinHash: text('admin_pin_hash'),
    fullName: text('full_name'),
    status: userStatus('status').notNull().default('active'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_phone_key').on(t.phone),
    uniqueIndex('users_email_key').on(t.email),
  ],
);

export const tenants = pgTable(
  'tenants',
  {
    id: pk(),
    /** V1: nullable and unused. Exists so the aggregator wedge needs no migration. */
    groupId: uuid('group_id').references(() => merchantGroups.id, { onDelete: 'set null' }),
    legalName: text('legal_name'),
    displayName: text('display_name').notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'restrict' }),
    status: tenantStatus('status').notNull().default('draft'),
    planId: uuid('plan_id').references(() => plans.id, { onDelete: 'set null' }),
    locale: text('locale').notNull().default('en-IN'),
    currency: char('currency', { length: 3 }).notNull().default('INR'),
    /** Load-bearing: "today's offer" means today in the SHOP's timezone. */
    timezone: text('timezone').notNull().default('Asia/Kolkata'),
    /** Bumped on any content write; invalidates the AI answer cache. */
    contextVersion: integer('context_version').notNull().default(1),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** Last time this merchant acknowledged re-printing their QR after a platform-wide domain change. */
    qrDomainAckAt: timestamp('qr_domain_ack_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('tenants_status_idx').on(t.status),
    index('tenants_category_idx').on(t.categoryId),
    index('tenants_group_idx').on(t.groupId),
  ],
);

/**
 * THE PERMANENCE TABLE.
 * A slug is globally unique across all time and is NEVER reused and NEVER
 * deleted (a DELETE trigger raises). Renaming mints a new primary slug and
 * demotes the old one to an alias that 301s forever.
 */
export const merchantSlugs = pgTable(
  'merchant_slugs',
  {
    slug: text('slug').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'no action' }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: createdAt(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [
    index('merchant_slugs_tenant_idx').on(t.tenantId),
    uniqueIndex('merchant_slugs_one_primary')
      .on(t.tenantId)
      .where(sql`${t.isPrimary}`),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    role: merchantRole('role').notNull().default('staff'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('memberships_user_tenant_key').on(t.userId, t.tenantId),
    index('memberships_tenant_idx').on(t.tenantId),
  ],
);

/**
 * Deliberately a separate table, not a role value on memberships: it makes
 * "can a merchant escalate to platform admin?" answerable by inspection.
 */
export const platformAdmins = pgTable('platform_admins', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: platformRole('role').notNull().default('admin'),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    activeTenantId: uuid('active_tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    /** Set while a platform admin is impersonating; surfaced as a banner. */
    impersonatedBy: uuid('impersonated_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
  ],
);

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: pk(),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('otp_codes_phone_idx').on(t.phone, t.createdAt)],
);

/* ========================================================================== */
/* Tenant-owned content                                                       */
/* ========================================================================== */

export const businessProfiles = pgTable('business_profiles', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  tagline: text('tagline'),
  description: text('description'),
  logoMediaId: uuid('logo_media_id'),
  coverMediaId: uuid('cover_media_id'),
  phone: text('phone'),
  whatsapp: text('whatsapp'),
  email: text('email'),
  websiteUrl: text('website_url'),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  state: text('state'),
  pincode: text('pincode'),
  country: text('country').notNull().default('IN'),
  lat: text('lat'),
  lng: text('lng'),
  googleMapsUrl: text('google_maps_url'),
  /** Deep link to the merchant's Google Business Profile review page. */
  gbpReviewUrl: text('gbp_review_url'),
  socials: jsonb('socials').notNull().default({}),
  /** Vertical-specific fields, validated by a per-category Zod schema. */
  extra: jsonb('extra').notNull().default({}),
  accentColor: text('accent_color'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Multiple rows per weekday support split shifts (the 1-4pm lunch close). */
export const businessHours = pgTable(
  'business_hours',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    dayOfWeek: smallint('day_of_week').notNull(),
    opensAt: time('opens_at'),
    closesAt: time('closes_at'),
    isClosed: boolean('is_closed').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('business_hours_tenant_idx').on(t.tenantId, t.dayOfWeek)],
);

export const businessHolidays = pgTable(
  'business_holidays',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    label: text('label'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('business_holidays_tenant_date_key').on(t.tenantId, t.date)],
);

export const media = pgTable(
  'media',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    kind: mediaKind('kind').notNull().default('gallery'),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull().default(0),
    width: integer('width'),
    height: integer('height'),
    blurhash: text('blurhash'),
    /** { avif: {400,800,1600}, webp: {...} } -> storage keys */
    variants: jsonb('variants').notNull().default({}),
    altText: text('alt_text'),
    checksum: text('checksum'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('media_tenant_idx').on(t.tenantId, t.kind, t.sortOrder),
    unique('media_tenant_id_unique').on(t.tenantId, t.id),
  ],
);

export const catalogGroups = pgTable(
  'catalog_groups',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('catalog_groups_tenant_idx').on(t.tenantId, t.sortOrder),
    unique('catalog_groups_tenant_id_unique').on(t.tenantId, t.id),
  ],
);

/**
 * Unified services + products (decision D15). They differ by one enum in
 * practice; two tables would mean two UIs, two APIs and two AI builders.
 */
export const catalogItems = pgTable(
  'catalog_items',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: catalogKind('kind').notNull().default('service'),
    name: text('name').notNull(),
    description: text('description'),
    /** NULL means "price on request" - correct for wholesale and medical. */
    priceMinor: integer('price_minor'),
    /** Supports "Rs 150-400" ranges, common for salons. */
    priceMaxMinor: integer('price_max_minor'),
    priceUnit: text('price_unit'),
    compareAtMinor: integer('compare_at_minor'),
    durationMinutes: integer('duration_minutes'),
    sku: text('sku'),
    stockStatus: stockStatus('stock_status'),
    /** Wholesale support. */
    minOrderQty: integer('min_order_qty'),
    bulkTiers: jsonb('bulk_tiers').notNull().default([]),
    groupId: uuid('group_id'),
    mediaId: uuid('media_id'),
    isAvailable: boolean('is_available').notNull().default(true),
    isFeatured: boolean('is_featured').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('catalog_items_tenant_kind_idx').on(t.tenantId, t.kind, t.isAvailable),
    index('catalog_items_tenant_group_idx').on(t.tenantId, t.groupId, t.sortOrder),
    // COMPOSITE foreign keys: a cross-tenant reference is impossible.
    foreignKey({
      columns: [t.tenantId, t.groupId],
      foreignColumns: [catalogGroups.tenantId, catalogGroups.id],
      name: 'catalog_items_group_fk',
    }).onDelete('set null'),
    foreignKey({
      columns: [t.tenantId, t.mediaId],
      foreignColumns: [media.tenantId, media.id],
      name: 'catalog_items_media_fk',
    }).onDelete('set null'),
  ],
);

/**
 * Offer STATUS is never stored - it is computed at read time (decision D14).
 * A cron that flips a boolean can leave a merchant's page actively wrong.
 */
export const offers = pgTable(
  'offers',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    terms: text('terms'),
    mediaId: uuid('media_id'),
    discountType: discountType('discount_type').notNull().default('custom'),
    discountValueMinor: integer('discount_value_minor'),
    discountPercent: integer('discount_percent'),
    couponCode: text('coupon_code'),
    ctaType: ctaType('cta_type').notNull().default('none'),
    ctaValue: text('cta_value'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    /** Recurring daily window, e.g. happy hour 16:00-19:00. */
    dailyStartTime: time('daily_start_time'),
    dailyEndTime: time('daily_end_time'),
    /** Restrict to weekdays, e.g. {0,6} for weekends only. */
    activeWeekdays: smallint('active_weekdays').array(),
    isPublished: boolean('is_published').notNull().default(false),
    isFeatured: boolean('is_featured').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('offers_tenant_window_idx').on(t.tenantId, t.isPublished, t.startsAt, t.endsAt),
    foreignKey({
      columns: [t.tenantId, t.mediaId],
      foreignColumns: [media.tenantId, media.id],
      name: 'offers_media_fk',
    }).onDelete('set null'),
  ],
);

/**
 * QR metadata only. The SOURCE OF TRUTH for the URL is merchant_slugs;
 * images are rendered on demand so no stored artefact can drift.
 */
export const qrCodes = pgTable(
  'qr_codes',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    label: text('label').notNull().default('Main'),
    style: jsonb('style').notNull().default({}),
    downloadCount: integer('download_count').notNull().default(0),
    lastDownloadedAt: timestamp('last_downloaded_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('qr_codes_token_key').on(t.token),
    index('qr_codes_tenant_idx').on(t.tenantId),
  ],
);

/* ========================================================================== */
/* Analytics                                                                  */
/* ========================================================================== */

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull(),
    eventType: text('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    /** sha256(daily rotating salt || ip || ua || tenant) - not correlatable across days. */
    visitorHash: text('visitor_hash').notNull(),
    sessionHash: text('session_hash'),
    qrCodeId: uuid('qr_code_id'),
    targetType: text('target_type'),
    targetId: uuid('target_id'),
    section: text('section'),
    deviceClass: deviceClass('device_class').notNull().default('unknown'),
    osFamily: text('os_family'),
    referrerClass: referrerClass('referrer_class').notNull().default('other'),
    city: text('city'),
    country: text('country'),
  },
  (t) => [
    index('analytics_events_tenant_time_idx').on(t.tenantId, t.occurredAt),
    index('analytics_events_tenant_type_time_idx').on(t.tenantId, t.eventType, t.occurredAt),
  ],
);

export const analyticsDaily = pgTable(
  'analytics_daily',
  {
    tenantId: uuid('tenant_id').notNull(),
    date: date('date').notNull(),
    eventType: text('event_type').notNull(),
    targetType: text('target_type').notNull().default(''),
    targetId: text('target_id').notNull().default(''),
    deviceClass: deviceClass('device_class').notNull().default('unknown'),
    count: integer('count').notNull().default(0),
    uniqueVisitors: integer('unique_visitors').notNull().default(0),
  },
  (t) => [
    primaryKey({
      columns: [t.tenantId, t.date, t.eventType, t.targetType, t.targetId, t.deviceClass],
    }),
  ],
);

/* ========================================================================== */
/* AI                                                                         */
/* ========================================================================== */

export const aiConfigs = pgTable('ai_configs', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  isEnabled: boolean('is_enabled').notNull().default(false),
  greeting: text('greeting'),
  tone: text('tone').notNull().default('friendly'),
  /** MERCHANT-AUTHORED, therefore UNTRUSTED. Injected as fenced content. */
  extraInstructions: text('extra_instructions'),
  blockedTopics: text('blocked_topics').array(),
  monthlyQuestionLimit: integer('monthly_question_limit').notNull().default(200),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    visitorHash: text('visitor_hash').notNull(),
    messageCount: integer('message_count').notNull().default(0),
    startedAt: createdAt(),
  },
  (t) => [
    index('ai_conversations_tenant_idx').on(t.tenantId, t.startedAt),
    unique('ai_conversations_tenant_id_unique').on(t.tenantId, t.id),
  ],
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id'),
    role: text('role').notNull(),
    content: text('content').notNull(),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    provider: text('provider'),
    model: text('model'),
    answerSource: text('answer_source'),
    cacheHit: boolean('cache_hit').notNull().default(false),
    latencyMs: integer('latency_ms'),
    flagged: boolean('flagged').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('ai_messages_tenant_idx').on(t.tenantId, t.createdAt),
    foreignKey({
      columns: [t.tenantId, t.conversationId],
      foreignColumns: [aiConversations.tenantId, aiConversations.id],
      name: 'ai_messages_conversation_fk',
    }).onDelete('cascade'),
  ],
);

/** Mandatory, not an optimisation: free AI tiers are rate-limited org-wide. */
export const aiAnswerCache = pgTable(
  'ai_answer_cache',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    questionHash: text('question_hash').notNull(),
    answer: text('answer').notNull(),
    contextVersion: integer('context_version').notNull(),
    hits: integer('hits').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('ai_answer_cache_key').on(t.tenantId, t.questionHash, t.contextVersion)],
);

/* ========================================================================== */
/* Platform operations                                                        */
/* ========================================================================== */

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => plans.id, { onDelete: 'set null' }),
    status: subscriptionStatus('status').notNull().default('active'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAt: timestamp('cancel_at', { withTimezone: true }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('subscriptions_tenant_idx').on(t.tenantId)],
);

export const tenantFeatureOverrides = pgTable(
  'tenant_feature_overrides',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    flagKey: text('flag_key')
      .notNull()
      .references(() => featureFlags.key, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.flagKey] })],
);

/** Append-only. The app role has no UPDATE/DELETE grant on this table. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: pk(),
    actorUserId: uuid('actor_user_id'),
    actorType: text('actor_type').notNull().default('system'),
    tenantId: uuid('tenant_id'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ipHash: text('ip_hash'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_tenant_idx').on(t.tenantId, t.createdAt),
    index('audit_logs_actor_idx').on(t.actorUserId, t.createdAt),
  ],
);

/** Postgres-backed job queue. SELECT ... FOR UPDATE SKIP LOCKED. */
export const outbox = pgTable(
  'outbox',
  {
    id: pk(),
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull().default({}),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('outbox_pending_idx').on(t.runAfter).where(sql`${t.completedAt} IS NULL`)],
);

/**
 * Durable rate-limit buckets (see auth/durable-rate-limit.ts). One row per
 * (key, fixed window). System-scoped, not tenant-owned — this protects
 * accounts and SMS spend, which are platform concerns, not merchant data.
 */
export const rateLimitBuckets = pgTable(
  'rate_limit_buckets',
  {
    bucketKey: text('bucket_key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    hits: integer('hits').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.bucketKey, t.windowStart] }),
    index('rate_limit_buckets_window_idx').on(t.windowStart),
  ],
);
