# 04 — Database Architecture

PostgreSQL. Shared database, shared schema, `tenant_id` everywhere, RLS forced.

## Conventions

- **PK:** `uuid` (v7 where available — time-ordered, so it indexes like a sequence but leaks no
  count). Rationale: tenant-scoped data must not expose enumerable integer IDs publicly.
- **Timestamps:** `created_at`, `updated_at` — `timestamptz`, never naive. `deleted_at` for soft
  delete on tenant-owned entities.
- **Money:** `integer` **minor units** (paise) + `currency char(3)`. Never floats. Never `numeric`
  for prices — integer paise removes an entire class of rounding bug.
- **Composite FKs:** child rows reference `(tenant_id, id)` of their parent, so a cross-tenant
  reference is rejected by the database itself.
- **RLS:** `ENABLE` + `FORCE` on every tenant-owned table; app role has no `BYPASSRLS`.
- Enums as Postgres `enum` types where the set is closed and stable; `text` + `CHECK` where it may grow.

---

## 1. Identity & tenancy

### `tenants`
The merchant/business. Root of all ownership.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Never reused, never deleted |
| `group_id` | uuid FK → `merchant_groups.id` NULL | **V1: nullable and unused.** Exists so the aggregator/multi-branch wedge (`01` §4.5) needs no migration later. |
| `legal_name` | text | Internal |
| `display_name` | text NOT NULL | Shown publicly |
| `category_id` | uuid FK → `categories.id` | Drives template + AI framing |
| `status` | enum | `draft`, `active`, `suspended`, `deleted` |
| `plan_id` | uuid FK → `plans.id` | |
| `locale` | text default `'en-IN'` | i18n hook, V1 single value |
| `currency` | char(3) default `'INR'` | |
| `timezone` | text default `'Asia/Kolkata'` | **Load-bearing** — offer activation windows depend on it |
| `published_at` | timestamptz NULL | NULL = never published; public page shows "coming soon" |
| `created_at`/`updated_at`/`deleted_at` | timestamptz | |

Indexes: `(status)`, `(category_id)`, `(group_id)`, `(deleted_at)` partial.

> **Why `timezone` is not cosmetic:** "today's offer" must mean today in the *shop's* time, not the
> server's. Storing it per-tenant rather than assuming IST is the difference between a correct
> product and a subtly wrong one the day we expand beyond India.

### `merchant_slugs` — the permanence table
**The most important table in the system.** Enforces `03-ARCHITECTURE.md` §E2.

| Column | Type | Notes |
|---|---|---|
| `slug` | citext **PK** | Globally unique across all time. **Never deleted, never reused.** |
| `tenant_id` | uuid FK → `tenants.id` NOT NULL | |
| `is_primary` | boolean NOT NULL default false | Exactly one true per tenant |
| `created_at` | timestamptz | |
| `retired_at` | timestamptz NULL | Set when demoted to alias; row still resolves forever |

Constraints:
- `UNIQUE (tenant_id) WHERE is_primary` — partial unique index guarantees exactly one canonical slug.
- **No `ON DELETE CASCADE`.** Deleting a tenant must not delete its slugs — that would free them for
  reuse, which is the catastrophic failure mode.
- Rows are `INSERT`-only and `UPDATE`-only on `is_primary`/`retired_at`. **A `DELETE` trigger raises
  an exception.** Belt and braces, because policy is not enough for a rule this important.

### `qr_codes`
Metadata and download history only — **not** the source of truth for the URL (that is `merchant_slugs`).

| Column | Notes |
|---|---|
| `id`, `tenant_id` | |
| `token` | text UNIQUE — the permanent `/q/{token}` short alias |
| `label` | e.g. "Counter standee", "Menu card" — lets a merchant track where codes are placed |
| `style` | jsonb — colour, logo ref, EC level, frame |
| `download_count`, `last_downloaded_at` | |

**Note:** multiple `qr_codes` rows per tenant all encode URLs resolving to the same page. They exist
for *placement analytics* ("the table-tent outperforms the door sticker"), not for different
destinations. **[HYPOTHESIS]** merchants will value this; it is cheap to build and easy to drop.

### `users`, `memberships`, `roles`

`users`: `id`, `phone` (citext, unique, E.164), `email` (nullable, unique), `password_hash`
(nullable — OTP-only users have none), `totp_secret` (nullable, required for platform admins),
`full_name`, `status`, timestamps.
**A user is NOT tenant-scoped** — one person may own two shops. This is deliberate and common.

`memberships`: the join that carries tenancy. `id`, `user_id`, `tenant_id`, `role`
(`owner`|`manager`|`staff`), `status`, timestamps. `UNIQUE (user_id, tenant_id)`.

`platform_admins`: `user_id` PK, `role` (`super_admin`|`admin`|`support`), timestamps.
**Deliberately a separate table, not a role value in `memberships`.** A platform admin is a
different kind of principal, and separating the tables makes "can a merchant ever escalate to
platform admin?" answerable by inspection: there is no code path that writes this table outside the
super-admin console.

**RBAC — only four roles, as the brief requested (no unnecessary complexity):**

| Role | Can |
|---|---|
| `owner` | Everything within the tenant, incl. billing, members, delete |
| `manager` | Content CRUD (profile, catalog, offers, media), view analytics. No billing, no members |
| `staff` | Offers + catalog availability toggles only. **[INTERPRETATION]** exists because the shop assistant updates today's price, not the owner |
| platform `admin` | Cross-tenant admin; **cannot** read merchant analytics detail without an audited impersonation session |

### `sessions`
`id`, `user_id`, `token_hash`, `tenant_id` (active tenant context), `ip_hash`, `user_agent`,
`expires_at`, `revoked_at`. Server-side, revocable, auditable.

---

## 2. Business content

### `business_profiles` (1:1 with tenant)
`tenant_id` PK, `tagline`, `description`, `logo_media_id`, `cover_media_id`, `phone`, `whatsapp`,
`email`, `website_url`, `address_line1/2`, `city`, `state`, `pincode`, `country`,
`lat`/`lng` (numeric NULL), `google_maps_url`, `gbp_review_url`, `socials` (jsonb),
`extra` (jsonb — vertical-specific fields, see note), timestamps.

> **Why `extra jsonb`:** a wholesaler needs GST number and MOQ policy; a restaurant needs veg/non-veg
> and FSSAI; a salon needs neither. Modelling each vertical as columns would mean a migration per
> vertical. `jsonb` validated by a per-category **Zod schema in application code** gives flexibility
> without schema churn — and because it is validated at the boundary, it does not become a dumping
> ground. Fields that prove universal get promoted to real columns later.

### `business_hours`
`id`, `tenant_id`, `day_of_week` (0–6), `opens_at` (time), `closes_at` (time), `is_closed` (bool).
Multiple rows per day support split hours (the 1–4 pm lunch close is near-universal in Indian
retail — a single open/close pair per day would be wrong for most of our market).
`business_holidays`: `tenant_id`, `date`, `label` — overrides regular hours.

**Open/closed is computed at render time** in the tenant's timezone. Never stored — a stored
`is_open` boolean would be stale within the hour and would require a cron per tenant.

### `categories`
Platform-managed taxonomy (barber, salon, restaurant, cafe, grocery, clothing, medical, wholesale,
services…). `id`, `slug`, `name`, `parent_id`, `template_key`, `default_fields` (jsonb), `sort_order`.
Not tenant-owned — no RLS.

### `catalog_items` — **the merged products/services table**

Per `00-EXECUTIVE-SUMMARY.md` Challenge 4.

| Column | Notes |
|---|---|
| `id`, `tenant_id` | |
| `kind` | enum `service` \| `product` |
| `name`, `description` | |
| `price_minor` | integer NULL — NULL means "price on request" (correct for wholesale/medical) |
| `price_max_minor` | integer NULL — supports "₹150–₹400" ranges, common for salons |
| `price_unit` | text NULL — "per kg", "per piece", "per 100 units" |
| `compare_at_minor` | integer NULL — strike-through price |
| `duration_minutes` | integer NULL — services only |
| `sku`, `stock_status` | products only; `stock_status` enum `in_stock`\|`low`\|`out`\|`made_to_order` |
| `min_order_qty`, `bulk_tiers` (jsonb) | **wholesale support** — the brief's §13 requirement |
| `group_id` | uuid FK → `catalog_groups.id` NULL — merchant's own sections ("Haircuts", "Beard") |
| `media_id` | primary image |
| `is_available`, `is_featured` | |
| `sort_order` | integer — merchant drag-to-reorder |
| timestamps + `deleted_at` | |

Indexes: `(tenant_id, kind, is_available)`, `(tenant_id, group_id, sort_order)`,
FK `(tenant_id, group_id)` → `catalog_groups (tenant_id, id)` **composite** — cross-tenant grouping
is impossible.

**Validation:** `CHECK (price_max_minor IS NULL OR price_max_minor >= price_minor)`,
`CHECK (duration_minutes IS NULL OR kind = 'service')`.

### `offers`

| Column | Notes |
|---|---|
| `id`, `tenant_id` | |
| `title`, `description`, `terms` | |
| `media_id` | |
| `discount_type` | enum `percent`\|`flat`\|`bogo`\|`custom` |
| `discount_value_minor` / `discount_percent` | |
| `coupon_code` | text NULL |
| `cta_type`, `cta_value` | call / whatsapp / directions / link |
| `starts_at`, `ends_at` | **timestamptz NULL** |
| `daily_start_time`, `daily_end_time` | time NULL — "happy hour 4–7 pm every day" |
| `active_weekdays` | smallint[] NULL — "weekends only" |
| `is_published` | boolean — merchant's draft/publish toggle |
| `sort_order`, timestamps, `deleted_at` | |

**Offer status is COMPUTED, never stored.** The brief requires merchants not to manually remove
expired offers; the correct implementation is a derived status, not a cron job that mutates rows:

```sql
-- conceptual; evaluated in the tenant's timezone at render time
status = CASE
  WHEN NOT is_published                      THEN 'draft'
  WHEN starts_at IS NOT NULL AND now() < starts_at THEN 'upcoming'
  WHEN ends_at   IS NOT NULL AND now() > ends_at   THEN 'expired'
  WHEN NOT matches_daily_window_and_weekday  THEN 'inactive_now'
  ELSE 'active'
END
```

> **[INTERPRETATION] Why this matters more than it looks:** a cron that flips an `is_active` column
> has a failure mode where a festival offer stays live for a week after it ended, making the
> merchant's page actively *wrong* — worse than empty. A computed status cannot drift, has no cron
> to fail, and is correct the instant the clock passes the boundary. Index
> `(tenant_id, is_published, starts_at, ends_at)` keeps the query fast.

### `media`
`id`, `tenant_id`, `r2_key`, `kind`, `mime`, `bytes`, `width`, `height`, `blurhash`,
`variants` (jsonb: the 400/800/1600 AVIF+WebP keys), `alt_text`, `sort_order`, `checksum`,
timestamps, `deleted_at`.
Storage path is **tenant-prefixed**: `t/{tenant_id}/{media_id}/{variant}.avif` — so storage-layer
isolation is visible in the key itself and a mis-scoped signed URL is obvious in logs.

---

## 3. Analytics

### `analytics_events` — partitioned monthly by `occurred_at`
`id`, `tenant_id`, `event_type`, `occurred_at`, `visitor_hash` (see `03` §G), `session_hash`,
`qr_code_id` NULL, `target_type`/`target_id` NULL (which offer/item), `section` NULL,
`device_class` (`mobile`|`tablet`|`desktop`), `os_family`, `referrer_class`
(`qr`|`direct`|`search`|`social`|`other`), `city` NULL, `country`.

**No IP. No user agent string. No cookie. No user ID.** Only the rotating hash.
Indexes: `(tenant_id, occurred_at)`, `(tenant_id, event_type, occurred_at)`.
Retention: 90 days, enforced by **detaching and dropping the old partition** (instant) rather than
a `DELETE` (which would bloat and lock).

### `analytics_daily` — rollups (what dashboards actually read)
`tenant_id`, `date`, `event_type`, `target_type`, `target_id`, `count`, `unique_visitors`,
`device_class`. PK `(tenant_id, date, event_type, target_type, target_id, device_class)`.
Retained **forever** — it is small, and year-over-year comparison is a genuine merchant value.

**[INTERPRETATION]** Splitting raw events (90 days) from rollups (forever) is what keeps this table
from becoming the scaling problem identified in `03` §H, while still letting a merchant see "last
Diwali vs this Diwali".

---

## 4. AI

### `ai_configs` (1:1 tenant)
`tenant_id` PK, `is_enabled`, `greeting`, `tone`, `extra_instructions` (text — **merchant-authored,
therefore untrusted**, see `06-AI-ARCHITECTURE.md`), `blocked_topics`, `monthly_question_limit`,
`updated_at`.

### `ai_conversations` / `ai_messages`
Conversation: `id`, `tenant_id`, `visitor_hash`, `started_at`, `message_count`.
Message: `id`, `conversation_id`, `tenant_id`, `role`, `content`, `tokens`, `provider`, `model`,
`cache_hit`, `latency_ms`, `flagged`, `created_at`.
**Purpose beyond logging:** the questions customers actually ask are a *product* — surfaced to the
merchant as "customers asked 12 times about home delivery; you don't mention it on your page."
**[HYPOTHESIS]** this may be one of the most valuable retention features in the whole product, and
it costs nothing extra to collect.

### `ai_answer_cache`
`id`, `tenant_id`, `question_norm_hash`, `answer`, `context_version`, `hits`, `created_at`.
**Mandatory, not an optimisation** — `01` §7 establishes that free AI tiers are rate-limited
org-wide. Invalidated whenever the tenant's content changes (`context_version` bumps on any
write to profile/catalog/offers/hours).

---

## 5. Platform

- **`plans`**: `id`, `key`, `name`, `price_minor`, `interval`, `limits` (jsonb: catalog items,
  offers, media MB, AI questions/mo, branches), `features` (jsonb), `is_public`, `sort_order`.
  **Limits in jsonb, enforced in the application** — so a pricing experiment is a data change, not
  a deploy.
- **`subscriptions`**: `tenant_id`, `plan_id`, `status`, `current_period_end`, `cancel_at`,
  `trial_ends_at`, provider refs. (Billing integration is post-V1; the table exists so plan state
  has a home from day one.)
- **`feature_flags`**: `key`, `description`, `default_enabled`, `rules` (jsonb).
  **`tenant_feature_overrides`**: `tenant_id`, `flag_key`, `enabled`.
- **`audit_logs`**: `id`, `actor_user_id`, `actor_type`, `tenant_id` NULL, `action`, `entity_type`,
  `entity_id`, `before`/`after` (jsonb), `ip_hash`, `created_at`. **Append-only; no UPDATE/DELETE
  grant to the app role.** Mandatory for: slug changes, role changes, suspension, plan changes,
  QR re-pointing, impersonation, deletion.
- **`merchant_groups`** (V1: table exists, UI does not): `id`, `name`, `type`
  (`association`|`franchise`|`multi_branch`|`reseller`), `owner_user_id`.
- **`outbox`**: `id`, `topic`, `payload`, `run_after`, `attempts`, `locked_at`, `completed_at`.
  A simple Postgres-backed job table for report sending, rollups, image processing and cache
  invalidation. **Deliberately not Redis/SQS** — one fewer service, and at our volume a `SELECT …
  FOR UPDATE SKIP LOCKED` loop is entirely sufficient. Revisit only when measured.

---

## 6. RLS policy pattern

Applied to every tenant-owned table:

```sql
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_items FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON catalog_items
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

- `USING` guards reads/updates/deletes; `WITH CHECK` guards inserts/updates — **both are required**;
  omitting `WITH CHECK` would let a tenant insert a row owned by another tenant.
- `current_setting(..., true)` returns NULL when unset → policy evaluates false → **zero rows**.
  Fail-closed by default.
- The public page path uses a **separate read-only role** with a policy restricted to published,
  non-deleted rows of the resolved tenant — so the public renderer physically cannot read draft
  content or another tenant, even with a code bug.
- Platform-admin operations use a distinct role and an **audited** elevated path — never by
  disabling RLS globally.

---

## 7. Migration & integrity rules

1. Forward-only, reviewed, transactional migrations.
2. Breaking changes use **expand → backfill → contract** across three releases so app rollback never
   needs a DB rollback.
3. Every FK on tenant-owned data is **composite** on `(tenant_id, …)`.
4. `merchant_slugs` and `tenants` rows are **never hard-deleted** (trigger-enforced).
5. Every new tenant-owned table requires, in the same PR: RLS policies **and** a row in the
   tenant-isolation test matrix. **CI fails otherwise** — this is the mechanism that keeps
   isolation correct as the schema grows, which is where multi-tenant systems normally fail.
