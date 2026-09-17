# 03 — Technical Architecture

Every major decision follows the required format:
**INITIAL IDEA → RESEARCH → ALTERNATIVES → TRADE-OFFS → RECOMMENDATION → REASON**

---

## A. Governing constraints

These are ranked. When two conflict, the higher one wins. This ordering is the single most important
thing in the document — it resolves every future argument.

1. **Permanence.** A printed QR must resolve correctly for years. Nothing may compromise this.
2. **Tenant isolation.** Merchant A must never reach Merchant B's data, under any manipulation.
3. **Public-page speed on a low-end Android over a slow network.** This is the product working.
4. **Low initial cost** — but never at the expense of 1, 2 or 3.
5. **Portability.** No decision may create a dependency we cannot migrate off within a sprint.
6. **Simplicity.** The smallest architecture that satisfies 1–5.

**[INTERPRETATION]** Constraint 5 is doing more work than it appears. Because our cheapest hosting
options are free tiers with commercial-use and pausing risks (`01-MARKET-RESEARCH.md` §7), we must
assume **we will be forced to move**. An architecture that can redeploy to a plain VPS in a day is
not over-engineering here — it is the direct mitigation for the biggest infrastructure risk.

---

## B. Overall shape: modular monolith

**INITIAL IDEA:** Not specified; microservices implied as a scaling option.
**RESEARCH/REASONING:** At 100k merchants the workload is overwhelmingly cached reads of small
documents. There is no independent scaling axis that justifies service boundaries, and no separate
team to own them.
**ALTERNATIVES:** (a) microservices, (b) serverless-function-per-endpoint, (c) modular monolith.
**TRADE-OFFS:** Microservices add network failure modes, distributed transactions, and deployment
complexity for zero benefit at our scale, and make tenant-isolation auditing *harder* (more places
to get it wrong). Function-per-endpoint fragments the tenant-scoping layer.
**RECOMMENDATION: Modular monolith**, deployed as one Next.js application, with hard internal module
boundaries so modules can be extracted later if ever justified.
**REASON:** Satisfies constraints 5 and 6; keeps the isolation layer in exactly one place
(constraint 2).

```
apps/web  (Next.js 15, App Router)
├── (public)/m/[slug]        ← public merchant page   — SSR + ISR, no auth, cached hard
├── (public)/q/[token]       ← optional short QR entry — 301 to canonical /m/[slug]
├── (merchant)/app/*         ← merchant dashboard      — auth required, tenant-scoped
├── (admin)/admin/*          ← platform admin          — platform role required
└── api/*                    ← route handlers

packages/
├── core-domain/     entities, invariants, zod schemas   (no I/O — pure, unit-testable)
├── db/              drizzle schema, migrations, RLS policies
├── tenancy/         *** the tenant-scope layer — single chokepoint for all data access ***
├── auth/            sessions, OTP, RBAC, permission checks
├── media/           upload, validation, sharp pipeline, R2 client
├── qr/              QR render (PNG/SVG), slug allocation & history
├── analytics/       event ingest, daily rollups, merchant report
├── ai/              provider abstraction, context builder, cache, guardrails
└── ui/              design system (Tailwind + shadcn/ui)
```

**Rule:** no module imports another module's internals; all cross-module access goes through its
public index. Enforced by lint rules (`eslint-plugin-boundaries`) in CI.

---

## C. Stack decisions

### C1. Application framework

**INITIAL IDEA:** Next.js/React + TypeScript (suggested but explicitly not pre-decided).
**ALTERNATIVES:** (a) Next.js full-stack, (b) SvelteKit, (c) Remix/React Router 7, (d) separate
Django/Rails API + SPA, (e) Astro for public pages + separate dashboard app.
**TRADE-OFFS:**
- Astro would produce the fastest public pages (near-zero JS) — genuinely attractive for constraint
  3 — but splits the codebase in two and duplicates the tenancy layer. **This is the closest call in
  the document.**
- SvelteKit is lighter and faster but has a materially smaller hiring pool in India.
- A separate API + SPA doubles deployment surface and loses SSR on the page that most needs it.
**RECOMMENDATION: Next.js 15 (App Router) + TypeScript** for the dashboard, admin console and API —
**with the public merchant page (`/m/{slug}`) served as a plain Route Handler that hand-renders
HTML, not as a React page.**
**REASON:** We keep one codebase and one talent pool for everything that benefits from React
(the dashboard, the admin console), while the one route with a hard performance constraint pays
none of the framework's cost. **This resolves the Astro-vs-Next.js tension above rather than
inheriting it**: the public page gets Astro-grade output (near-zero JS) without a second codebase
or a duplicated tenancy layer, because it is still one Next.js app — just one route within it that
opts out of React entirely for its response.

**Why "server component with effectively zero client JS" was not enough on its own:** an earlier
build of this page did exactly that — zero client components beyond two small islands — and still
shipped **~174 KB gzipped**. Inspecting the build manifest showed why: Next.js App Router attaches
its client runtime (router, prefetching, RSC streaming protocol) at the **root layout**, so it
loads on every route regardless of that route's own client-component usage. The fix had to remove
the route from the React render tree entirely, not just remove its "use client" components.

**Implementation:** `app/(public)/m/[slug]/route.ts` calls `loadPublicPage()` (unchanged — the data
layer doesn't know or care how its output is rendered) and passes the result to
`modules/merchants/render-html.ts`, which returns a complete HTML string: inline CSS (no stylesheet
request), inline JSON-LD, and one inline `<script>` covering the analytics beacon, delegated CTA
click tracking and the ask-assistant widget — plain DOM APIs, no framework. Because there is no
React here, every interpolated value (business name, offer text, address, coupon codes — all
merchant- or customer-influenced) is run through an explicit HTML escaper; this is tested
adversarially (script-injection, attribute-breakout, JSON-LD-breakout attempts) rather than trusted
by convention. `redirect()`/`notFound()` from `next/navigation` don't function the same way inside a
Route Handler, so the alias-redirect and 404/410/suspended/coming-soon states are built as plain
`Response` objects with explicit status codes instead — verified against a live database by actually
renaming a merchant's slug and confirming the old address 308-redirects to the new one.

**Guardrail:** a CI budget test fails the build if the public page ships more than **30 KB gzipped
JS**. **Measured result: ~1.7 KB** (the one inline script), with total page weight — HTML, CSS, JS
and JSON-LD together — at **~3.9 KB gzipped**. Roughly 8x under budget on JS alone. The dashboard and
admin console are unaffected and remain ordinary React with no such budget, because a merchant who
has logged in has already chosen to be there — the budget exists for the customer standing in a
shop on a slow connection, which is only ever this one route.

### C2. Database

**RECOMMENDATION: PostgreSQL.** Non-negotiable.
**REASON:** Row-Level Security gives us tenant isolation *enforced by the database itself* — a
qualitatively stronger guarantee than application-layer checks (constraint 2). Also: mature JSONB
for flexible per-vertical fields, partial/composite indexes, partitioning for analytics, and
pgvector available later if ever needed. No NoSQL option offers RLS-equivalent isolation.

**Host:** **Neon** free tier for pilot — **[FACT]** 0.5 GB, no card, no expiry, commercial use
allowed, and critically **it does not delete or permanently pause** unlike the rejected options.
Migration path: Neon paid → managed Postgres → self-hosted. Plain Postgres means all three are the
same database.

### C3. ORM

**ALTERNATIVES:** Prisma, Drizzle, Kysely, raw SQL.
**RECOMMENDATION: Drizzle.**
**REASON:** (1) It generates predictable SQL, which matters because we must be able to *read and
audit* every query for tenant scoping. (2) It runs on edge/Workers runtimes without a proprietary
query engine, preserving hosting portability (constraint 5). (3) It does not fight `SET LOCAL` /
transaction-scoped session variables, which RLS requires. Prisma's historical friction with RLS and
its engine binary are disqualifying against constraints 2 and 5.

### C4. Authentication

**INITIAL IDEA:** "Authentication — free tier" (vendor implied).
**RESEARCH:** Our user is a shop owner in a tier-2/3 town. Email is a weak identifier for this
segment; phone is the real identity.
**ALTERNATIVES:** (a) Supabase Auth, (b) Clerk/Auth0 free tiers, (c) self-hosted sessions.
**TRADE-OFFS:** Hosted auth is faster to build but puts **identity** — the hardest thing to migrate
— in a vendor. Clerk/Auth0 free tiers become expensive per-MAU exactly when we succeed. Supabase
Auth is rejected along with Supabase (auto-pause).
**RECOMMENDATION: Self-hosted authentication.** Phone + OTP as the primary factor; email + password
available as an alternative; platform-admin accounts use email + password + **mandatory TOTP 2FA**.
Server-side sessions in Postgres (opaque token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie).
**REASON:** Identity lock-in is the most damaging kind (constraint 5), sessions in Postgres let us
revoke instantly and audit properly, and phone-OTP matches how this market actually authenticates.
**Cost note:** OTP SMS via MSG91 ≈ **₹0.14/SMS** — the one genuine per-merchant variable cost.
Mitigate with: OTP rate limiting per phone and per IP, 10-minute session-extension windows, long-
lived sessions (90 days) so merchants rarely re-authenticate, and WhatsApp-OTP as a cheaper channel
to evaluate later.

### C5. Object storage & images

**RECOMMENDATION: Cloudflare R2** + **`sharp`** processing at upload time.
**REASON:** **[FACT]** R2 gives 10 GB and **zero egress fees** — decisive, because merchant photos
are served on every scan and egress is the cost that would otherwise scale with our success. S3-
compatible, so migrating to S3/B2/MinIO is a config change (constraint 5).
**Pipeline:** validate magic bytes → strip EXIF (privacy + size) → re-encode to **AVIF + WebP** at
three widths (400/800/1600) → upload to R2 under `t/{tenant_id}/...` → serve via CDN with a long
`max-age` and content-hashed filenames.
**Rejected:** Vercel image optimisation (**[FACT]** 1,000 images/mo on the free tier and tied to a
host we are not using), Cloudflare Images (per-image cost that scales with merchants).
**Why process at upload rather than on-the-fly:** upload happens once per image; serving happens
millions of times. Pre-processing converts a recurring cost into a one-time one and removes a
runtime dependency from the hot path (constraint 3).

### C6. QR generation

**RECOMMENDATION: the open-source `qrcode` library, rendered server-side, on demand.**
**REASON:** **[FACT]** Uniqode charges $5–$99/mo *per account* with 3–500 code limits. At 10,000
merchants a QR-SaaS is economically impossible, and it would place our most permanence-critical
asset inside a third party that could change terms or disappear. QR is a well-specified, stable
standard; generating it ourselves is ~50 lines and permanently free. **This is the clearest
build-not-buy decision in the project.**

### C7. Analytics

**RECOMMENDATION: first-party events in our own Postgres**, with nightly rollups. No third-party
analytics on the public page.
**REASON:** (1) Constraint 3 — no third-party script on the critical path. (2) DPDP/privacy — we
collect no cookies and no PII. (3) The analytics *are* the retention product (the monthly merchant
report); that data must be ours. (4) Free, and the data volume is modest after rollup.

### C8. AI

**RECOMMENDATION:** provider-abstracted; start with whichever of Gemini Flash / Groq / Cloudflare
Workers AI survives the ToS check (research debt U2/U3). See `06-AI-ARCHITECTURE.md`.
**REASON:** **[FACT]** all free tiers are rate-limited **org-wide** (Gemini 1,500 req/day; Groq
14,400/day), so no provider can be trusted as a permanent foundation and caching is mandatory.

### C9. Hosting

**RECOMMENDATION:**
- **Pilot:** Cloudflare Workers/Pages (pending the U3 ToS check) — free, global, no cold-start
  penalty of note.
- **Production fallback, ready from day one:** a single small VPS (Hetzner/DO, ~₹400–900/mo) running
  the same container.
**REASON:** **[FACT]** Vercel Hobby prohibits commercial use, so the obvious default is off the
table; and since every remaining free option carries ToS or capacity risk, the architecture must
assume relocation. We therefore ship a **Dockerfile from day one** and keep zero host-proprietary
APIs in application code.

**Rejected:** Vercel Hobby (ToS), Supabase (pausing), Render/Railway free Postgres (deletion).

---

## D. Multi-tenancy

**INITIAL IDEA:** isolation at DB, API, auth, authz, storage and AI layers.
**ALTERNATIVES:** (a) database-per-tenant, (b) schema-per-tenant, (c) shared schema with `tenant_id`.
**TRADE-OFFS:** Database- and schema-per-tenant give the strongest isolation but make migrations
across 100k tenants operationally impossible, break connection pooling, and make cross-tenant
platform analytics painful. Shared schema is the only model that reaches 100k tenants on a small
team — but it puts the entire burden on correctness of scoping.
**RECOMMENDATION: shared database, shared schema, `tenant_id` on every tenant-owned row, with
FOUR independent layers of defence.**
**REASON:** operational reality at scale, with the isolation risk bought back through defence in
depth rather than through physical separation.

### The four layers

**Layer 1 — Schema.** Every tenant-owned table has a non-null `tenant_id`. Composite foreign keys
(`(tenant_id, id)`) make it structurally impossible for a child row to reference a parent in a
different tenant — the database rejects it. **This is the layer people forget, and it is the one
that catches the subtlest bugs.**

**Layer 2 — Postgres RLS.** RLS enabled and `FORCED` on every tenant table. Policies compare
`tenant_id` against `current_setting('app.tenant_id')`. The application connects as a role that has
**no** `BYPASSRLS`. A missing `WHERE` clause in application code therefore returns **zero rows**
rather than another tenant's data.

**Layer 3 — The `tenancy` module (single chokepoint).** All data access goes through a
`TenantScope` object obtained from the authenticated session. It opens a transaction, issues
`SET LOCAL app.tenant_id = $1`, and exposes the repositories. There is no other exported way to get
a database handle — enforced by an ESLint rule banning direct `db` imports outside `packages/db`
and `packages/tenancy`.

**Layer 4 — Authorization.** Every request resolves the tenant **server-side** from the session
(dashboard) or from the URL slug (public pages). **A `tenant_id` supplied by a client is never
trusted, never read, and never used** — if one appears in a request body it is ignored, and the
attempt is logged as a security event.

### Non-negotiable test gate

`packages/tenancy/__tests__/isolation.spec.ts` enumerates **every** tenant-owned table and every
API route and asserts Merchant A cannot read, list, update or delete Merchant B's rows. A new table
without a corresponding isolation test **fails CI**. This is the single most important test suite in
the codebase.

---

## E. QR & URL architecture — the permanence design

This section satisfies constraint 1 and must not be changed casually.

### E1. What the QR encodes

**INITIAL IDEA:** `ourplatform.com/s/barber-name` or `/m/barber-name`.
**ALTERNATIVES:**
(a) human-readable slug URL `/m/{slug}`
(b) opaque immutable token `/q/{token}`
(c) both.
**TRADE-OFFS:**
- A slug is readable, builds trust when printed under the code, shareable by word of mouth, and good
  for SEO — but slugs are the thing merchants want to *change* (rebrand, typo, business rename).
- An opaque token is permanent by construction and produces a physically smaller/denser-safe QR, but
  is untrustworthy-looking in print and useless for sharing verbally.
**RECOMMENDATION: (c) both, with `/m/{slug}` as the canonical printed URL.** `/q/{token}` exists
from day one as a permanent alias that 301-redirects to the current canonical URL, and is offered
for very small print sizes.
**REASON:** we get readability where it matters (print, word of mouth, SEO) without sacrificing
permanence, because slug permanence is guaranteed separately by E2.

### E2. Slug rules — the hard invariants

1. Slugs are allocated from a `merchant_slugs` table, **globally unique across all time**.
2. **A slug is NEVER reused.** Not after a rename, not after a merchant is deleted, not ever.
   *Reusing a slug would point a previously printed QR at a different business — the single worst
   failure this system can produce. It is prevented at the database level, not by policy.*
3. Renaming **mints a new primary slug** and demotes the old one to an alias. Aliases
   **301-redirect forever**. There is no expiry on an alias.
4. Reserved slugs (`admin`, `api`, `app`, `m`, `q`, `about`, `login`, …) are blocked by a seeded
   denylist.
5. Slugs are short, lowercase, `[a-z0-9-]`, 3–40 chars — short slugs mean fewer QR modules, which
   means the code still scans at 2 cm and from across a room.
6. **Deleting a merchant never frees the slug** and never 404s: it serves a branded "this business
   is no longer listed" page (E5).

### E3. "Regenerate QR" — disambiguated

The brief flags this as a risk. It is, and the fix is naming:

- **"Download QR" / "Restyle QR"** — merchant-facing, safe, unlimited. Changes size, format (PNG/
  SVG/PDF), error-correction level, colour, logo, frame. **The encoded URL is identical every time.**
  This is what merchants mean by "regenerate", and it can never break a printed code.
- **"Re-point QR target"** — platform-admin only, **disabled by default**, behind a typed
  confirmation that names the merchant and states plainly: *"Every QR already printed for this
  business will stop showing their page."* Logged to the audit trail. Exists only for genuine
  transfers of ownership.

**Implementation consequence:** the QR image is **not** stored as the source of truth. The source of
truth is the slug. Images are rendered on demand and cached. There is no stored artefact that can
drift from the URL.

### E4. Print correctness

- **Error correction:** level **Q (25%)** when a logo is embedded (logo occupies ≤ 20% of area),
  level **M (15%)** when not. Never embed a logo at level M.
- **Quiet zone:** 4 modules minimum, enforced in the render, non-removable.
- **Minimum print size:** 2 cm × 2 cm for a short URL; the download UI recommends **3 cm+** and
  warns below 2 cm.
- **Contrast:** dark-on-light enforced; the colour picker rejects combinations below the contrast
  threshold rather than letting a merchant produce an unscannable code.
- **Formats:** PNG (print-resolution), **SVG** (infinitely scalable — matters for banners), and a
  print-ready **PDF standee** with the URL printed in text beneath the code, so the page is
  reachable even if the code is damaged or the customer prefers typing.
- Every generated code is **verified by decoding it server-side before it is offered for download.**
  A QR that does not decode back to the expected URL is never delivered.

### E5. Lifecycle edge cases

| State | Behaviour | HTTP |
|---|---|---|
| Active | Render page | 200 |
| Renamed | Alias → canonical | 301 |
| Unpublished (never completed) | Branded "coming soon" + contact | 200 |
| Suspended (non-payment/ToS) | Branded "temporarily unavailable" | 200, `noindex` |
| Deleted (soft) | Branded "no longer listed" | **410 Gone**, `noindex` |
| Slug never existed | Branded 404 with search | 404 |

**Never** a raw 404, never a redirect to another merchant, never a blank page, never a parked-domain
screen. A customer standing in a shop scanning a code must always see something intentional.

### E6. Domain strategy

The domain is the **single point of failure for every printed asset in the field**. Treated as a
permanent corporate liability:
- One short domain, registered for the **maximum term**, auto-renew on, registrar lock on, with
  expiry monitoring that alerts 90/60/30/7 days out.
- Registrar account secured with 2FA and a shared recovery path (not one person's email).
- **[HYPOTHESIS]** If a domain migration ever becomes unavoidable, the old domain must be retained
  and 301-redirected **indefinitely** — budget for this permanently. This is why we do not buy a
  cheap first-year-promo TLD.
- A static, dependency-free fallback page is deployed at the edge so that even a total application
  outage serves *something* branded rather than an error.

---

## F. Public page performance

Constraint 3 is a release gate, not an aspiration.

- **Rendering:** **not a React page** — a Route Handler that hand-renders HTML directly (see §C1).
  SSR is real (the tenant's current data is fetched per request) but there is no RSC/hydration
  pipeline to pay for. "ISR" is approximated with `Cache-Control: public, s-maxage=60,
  stale-while-revalidate=300` at the CDN, which is host-portable rather than tied to Next's own
  revalidation mechanism — consistent with constraint 5.
- **Caching layers:** CDN edge cache (stale-while-revalidate) → Postgres. The database should be
  untouched by the overwhelming majority of scans once a CDN sits in front of this route.
- **JavaScript budget: ≤ 30 KB gzipped**, enforced in CI. **Measured on the real production
  build: ~1.7 KB** — one inline `<script>` covering the analytics beacon, CTA click tracking and
  the ask-assistant widget, no framework runtime at all. Interactivity is plain DOM APIs;
  **the page is fully functional with JavaScript disabled** — call, WhatsApp and directions are
  plain anchors and the ask-assistant form degrades to doing nothing (not to an error) without JS.
- **Images:** AVIF/WebP, correct `width`/`height` to prevent layout shift, `loading="lazy"` below
  the fold, LQIP blur placeholder, hero image preloaded.
- **Fonts:** **system font stack.** No webfont on the public page. A webfont is 15–40 KB and a render
  delay for a merchant page that gains nothing from it.
- **Targets (throttled 3G, mid-tier Android):** LCP < 2.0 s, CLS < 0.1, INP < 200 ms, total transfer
  < 150 KB on first view. **Measured total page weight (HTML+CSS+JS+JSON-LD), gzipped: ~3.9 KB** —
  comfortably inside budget even before images are counted.
- **Verification:** Lighthouse CI on every PR + a real low-end device test before each release.
- **Security note specific to this approach:** because the page is a hand-built HTML string rather
  than React-rendered, nothing escapes merchant- or customer-influenced text automatically. Every
  interpolated value goes through an explicit escaper in `modules/merchants/render-html.ts`, tested
  adversarially (script-injection, HTML-attribute-breakout and JSON-LD-breakout attempts) in
  `modules/merchants/__tests__/render-html.spec.ts`. This is the one place in the codebase where
  "the framework protects you by default" does not apply, and it is treated accordingly.

---

## G. Analytics architecture

**Privacy-first by construction** (DPDP-aligned):
- **No cookies. No device IDs. No third-party scripts. No raw IP storage.**
- Visitor de-duplication uses `visitor_hash = sha256(daily_rotating_salt || ip || user_agent ||
  tenant_id)`. The salt rotates every 24 h and old salts are destroyed, so the hash **cannot be
  correlated across days or across merchants**. This gives honest daily-unique counts while making
  long-term tracking cryptographically impossible.
- Geography only at city level, derived from the CDN's header — never stored more precisely.

**Pipeline:** `POST /api/e` (tiny, fire-and-forget, `sendBeacon`) → append to `analytics_events`
(monthly partitions) → nightly rollup into `analytics_daily` → dashboards read only rollups →
raw events retained 90 days then dropped by detaching the partition (instant, no `DELETE` storm).

**Events:** `page_view`, `section_view`, `offer_view`, `offer_click`, `catalog_item_view`,
`cta_call`, `cta_whatsapp`, `cta_directions`, `cta_website`, `cta_social`, `qr_download`,
`ai_question`.

**What the merchant dashboard answers** (the brief's four questions, deliberately in plain language):
"Is my QR bringing customers?" → scans + trend; "Which offers get attention?" → offer view/click
ranking; "When do people scan?" → hour × weekday heatmap; "What do they do?" → CTA breakdown.

**The monthly report** (WhatsApp/SMS/email) is part of this module, not marketing — it is the
retention mechanism identified in `00-EXECUTIVE-SUMMARY.md` §4.

---

## H. Scalability path

Deliberately boring, because the workload is cached reads.

| Scale | What changes |
|---|---|
| **10** | Single Next.js deploy + Neon free. Nothing special. |
| **100** | Add ISR/CDN caching properly. Add nightly rollups. Still free tier. |
| **1,000** | Move to paid Postgres (~₹1,000/mo). Connection pooling (PgBouncer/Neon pooler). Background jobs move to a proper queue. |
| **10,000** | Partition `analytics_events` monthly. Read replica for dashboards. Media on R2 + CDN (already). Per-tenant AI rate limits become load-bearing. |
| **100,000+** | Horizontal app scaling (stateless already). Analytics ingest to a queue/ClickHouse if Postgres strains. Consider shard-by-tenant *only if* measurement demands it. |

**Explicitly deferred until measured:** queues, ClickHouse, read replicas, sharding, microservices.
**[INTERPRETATION]** The honest engineering position: 100k merchants of mostly-cached static-ish
pages is a small workload by modern standards. The scaling risk in this product is not traffic —
it is **analytics event volume** and **AI request cost**, and both are addressed above.

---

## I. Backups, data safety, recovery

- **Soft delete everywhere** (`deleted_at`) for tenant-owned data. Hard delete only via an explicit,
  audited purge job after a retention window.
- **Backups:** provider PITR (Neon/managed) **plus** an independent nightly `pg_dump` to R2 with a
  30-day retention — *never rely solely on the hosting provider's own backups*, since provider
  account loss is one of the failure modes we are insuring against.
- **Restore drills quarterly.** A backup that has never been restored is a hypothesis, not a backup.
- **Migrations:** forward-only, reviewed, run in a transaction, tested against a restored production
  snapshot before release. Expand → backfill → contract for breaking changes.
- **Audit log** for every mutation to merchant identity, slugs, roles, plan and suspension state.
- **Slug and tenant IDs are never deleted or reused** (constraint 1).

---

## J. Deployment

- **Environments:** local → preview (per-PR, seeded synthetic data) → staging (production-like,
  restored sanitised snapshot) → production.
- **CI gates, all blocking:** typecheck, lint (incl. boundary + `no-direct-db-import` rules), unit,
  integration, **tenant-isolation suite**, migration dry-run, Lighthouse budget, JS-size budget,
  `npm audit`/Dependabot.
- **Release:** trunk-based, small PRs, feature flags for anything user-visible and incomplete.
- **Rollback:** previous deploy re-promotable in one click; migrations written to be backward-
  compatible for one release so app rollback never requires a DB rollback.
- **Monitoring from day one:** Sentry (errors), UptimeRobot/Better Stack (uptime — **alerting on the
  public page specifically**, because that is the promise we have made to merchants), Postgres slow-
  query log, and a synthetic check that scans a canonical QR URL end-to-end every 5 minutes.

**[INTERPRETATION]** That last synthetic check deserves emphasis: our core promise is that a printed
code resolves. We should know it is broken before a merchant standing in their shop does.
