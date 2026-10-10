# Manual Setup & Go-Live Guide

Everything in this document is a step a human has to take — an account to create,
a value to paste, a decision only you can make, or a check only a real browser
can do. Nothing here can be automated from inside this session: I have no
internet access to sign up for services, no payment method, and no way to
click through a provider's own dashboard on your behalf.

Work through the sections in order. Each one says **why** it's needed, not just
what to click, so you can make the trade-offs yourself where they exist.

---

## 0. Before you do anything: read this

The plan (`docs/00-EXECUTIVE-SUMMARY.md`) identified two blocking research
tasks that should happen **before** you spend money going live:

1. **Competitive teardown of Vyaparify / HDFC "My Business QR"** — the closest
   existing competitor. See `docs/08-V1-IMPLEMENTATION-PLAN.md` task P0-1.
2. **10–15 real merchant interviews** on willingness to pay, the ₹149 price
   point, and whether the permanence/independence pitch actually lands. See
   task P0-2.

Roughly 40% of the pricing and positioning in the plan is still hypothesis.
You can go live technically without doing this, but you'd be finding out
whether people will pay *after* spending on infrastructure, not before. Your
call — the code doesn't need this, the business does.

---

## 1. The one thing that must never be wrong: the domain

Every printed QR code encodes `https://your-domain.com/m/{slug}`. If this
domain ever lapses, changes, or gets flagged as unsafe, **every already-printed
QR code in the field breaks simultaneously**. Treat this as the single highest
priority item.

- [ ] **Register a domain** at the registrar of your choice (Cloudflare
  Registrar, Namecheap, GoDaddy). Register for the **maximum term available**
  (often 10 years) — this is cheap insurance against forgetting to renew.
- [ ] Turn on **auto-renew** and **registrar lock** (prevents unauthorized
  transfer) immediately after registration.
- [ ] Secure the registrar account itself with **2FA**, and make sure at least
  two people (not one person's personal email) can recover access to it.
- [ ] Set a calendar reminder **90 days before expiry** even with auto-renew on
  — payment methods expire, auto-renew can silently fail.
- [ ] Do **not** register a promotional first-year-cheap TLD you wouldn't want
  to keep for a decade. `docs/03-ARCHITECTURE.md` §E6 treats the domain as a
  permanent liability you're accepting on day one.

Cost: **₹900–1,500/year** — see `docs/10-COST-MODEL.md` for the full breakdown.
This is the one mandatory spend even on the ₹0 pilot track.

---

## 2. Choose and provision hosting

The app is a standard Next.js 16 app with a `Dockerfile` already in the repo
(multi-stage, standalone output, non-root user, built-in healthcheck). Two
realistic paths — pick one:

### Option A — Docker on a VPS (recommended for full control)
- [ ] Provision a small VPS: Hetzner, DigitalOcean, or similar. A 2 vCPU / 4GB
  instance is comfortably enough for V1 traffic.
- [ ] Point your domain's DNS `A`/`AAAA` record at the VPS IP (or use a CDN in
  front of it — see §3).
- [ ] Install Docker, then build and run:
  ```
  docker build -t merchant-platform .
  docker run -d --name merchant-platform -p 3000:3000 --env-file .env.production merchant-platform
  ```
- [ ] Put a reverse proxy in front (Caddy or nginx) for TLS termination —
  **Caddy is the simplest**: it gets a free Let's Encrypt certificate
  automatically with a two-line Caddyfile pointing at `localhost:3000`.

### Option B — Cloudflare Workers/Pages (cheapest to start; verify ToS first)
- [ ] **Before committing to this**, read Cloudflare's current Pages/Workers
  Terms of Service yourself for commercial-use restrictions. This is
  research debt item **U3** in `docs/01-MARKET-RESEARCH.md` — it was flagged
  but never independently verified, and Vercel's equivalent free tier
  explicitly bans commercial use, so don't assume Cloudflare's doesn't have
  a similar catch.
- [ ] If clear, connect the GitHub repo to Cloudflare Pages and deploy with
  the `@cloudflare/next-on-pages` adapter (Next.js App Router support on
  Workers has specific requirements — check current compatibility, since
  the app uses Node-specific packages like `sharp` and `postgres` that may
  need the `nodejs_compat` flag or may not run on Workers at all. **This is
  a real compatibility risk to verify with a test deploy before relying on
  it** — `sharp` in particular is a native binary and historically does not
  run in Workers' V8-isolate runtime.).

**My honest recommendation given the above**: start with **Option A** (a VPS).
It is the path this codebase was actually tested against (Dockerfile + a
plain Node runtime), it has zero unresolved compatibility questions, and it
is still cheap (~₹400–900/month, per `docs/10-COST-MODEL.md`).

---

## 3. Put a CDN in front of the public page (recommended)

The public merchant page is already tiny (~4KB gzipped total — see
`docs/12-KNOWN-ISSUES.md`) and sets `Cache-Control: public, s-maxage=60,
stale-while-revalidate=300`. A CDN in front of your origin will serve nearly
every scan without touching your server or database at all.

- [ ] Put your domain behind **Cloudflare (free plan is fine)** in "proxy"
  (orange-cloud) mode, or any CDN you prefer.
- [ ] Verify caching is actually working after deploy: `curl -I
  https://your-domain.com/m/{a-real-slug}` twice and check for a `CF-Cache-Status:
  HIT` header (or your CDN's equivalent) on the second request.
- [ ] This also gives you free DDoS protection and TLS, and is the easiest way
  to enable the Safe Browsing monitoring mentioned in §11.

---

## 4. Database

- [ ] Provision a **PostgreSQL 16+** instance. Recommended for the pilot:
  **Neon** (free tier: no card, no auto-pause, no expiry, commercial use
  allowed — this is why it was selected over Supabase/Render in
  `docs/09-DECISION-LOG.md` D6). For production at scale, any managed
  Postgres (Neon paid, RDS, a self-hosted instance) works — the app has zero
  Postgres-flavor-specific code.
- [ ] Create **three roles**, matching exactly what `src/modules/db/sql/10-rls.sql`
  expects:
  ```sql
  CREATE ROLE mdp_owner  LOGIN PASSWORD '<strong-password>' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  CREATE ROLE mdp_app    LOGIN PASSWORD '<strong-password>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  CREATE ROLE mdp_system LOGIN PASSWORD '<strong-password>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  CREATE DATABASE merchant_platform OWNER mdp_owner;
  ```
  Then, connected to `merchant_platform` itself:
  ```sql
  ALTER SCHEMA public OWNER TO mdp_owner;
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  ```
  **Use a real generated password for each role** (`openssl rand -base64 32`),
  not the `ownerpass`/`apppass`/`systempass` placeholders from local
  development — those are committed in `.env.example` and are public.
- [ ] Set `DATABASE_URL_OWNER`, `DATABASE_URL`, and **`DATABASE_URL_SYSTEM`**
  in your production environment (see §7). **`DATABASE_URL_SYSTEM` is easy to
  forget and the app will silently fall back to the tenant-restricted role if
  it's unset — which breaks login entirely**, since that role has zero grants
  on the `users`/`sessions`/`otp_codes` tables by design.
- [ ] Run migrations: `npm run db:migrate` (needs `DATABASE_URL_OWNER` set).
- [ ] Seed reference data (categories, plans, feature flags) and your first
  platform admin account:
  ```
  npm run db:seed
  ```
  This creates an admin login `admin@example.com` / `change-this-password`.
  **Change this password immediately after your first login** — the seed
  script's whole purpose is to get you into the admin console once; it is
  not meant to be a production credential.
- [ ] **Set up backups independent of your hosting provider.** Per
  `docs/03-ARCHITECTURE.md` §I, never rely solely on the provider's own
  backup mechanism (a lost provider account is a failure mode this should
  survive). At minimum, schedule a nightly `pg_dump` to object storage:
  ```
  pg_dump "$DATABASE_URL_OWNER" | gzip > backup-$(date +%F).sql.gz
  ```
  and upload it to R2/S3 with a 30-day retention policy. Wire this into the
  same cron as the worker script in §6.
- [ ] **Test a restore, once, before you have real merchant data you can't
  afford to lose.** A backup that has never been restored is a hypothesis,
  not a backup.

---

## 5. Object storage (merchant photos)

- [ ] Create a **Cloudflare R2** bucket (10GB free, zero egress fees — see
  `docs/03-ARCHITECTURE.md` §C5 for why this was chosen over S3/Supabase
  Storage).
- [ ] Create an R2 API token with read/write access scoped to that bucket
  only (Cloudflare dashboard → R2 → Manage API tokens).
- [ ] Set `STORAGE_DRIVER=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` in your environment.
- [ ] Either enable R2's public bucket access and set `R2_PUBLIC_BASE_URL` to
  that public URL, **or** put a Cloudflare custom domain in front of the
  bucket (recommended — nicer URLs, and you control caching headers).
- [ ] **Verify a real upload works before launch** — the R2 driver
  (`src/modules/media/storage.ts`) is implemented against R2's documented S3-
  compatible API but was only tested against the local-filesystem driver in
  this environment (no R2 credentials were available). Upload one image
  through the merchant dashboard's photo upload after deploying and confirm
  it renders back correctly.

---

## 6. Background jobs (analytics rollup, cleanup)

The app has no always-on worker process by design (`docs/03-ARCHITECTURE.md`
§H defers queues until measurement demands them). Instead, `npm run worker`
runs analytics rollup, raw-event pruning, and rate-limit bucket cleanup once
and exits.

- [ ] Schedule it to run **hourly** via cron, a systemd timer, or your
  hosting provider's scheduled-task feature:
  ```
  0 * * * * cd /path/to/app && DATABASE_URL_SYSTEM=... npm run worker >> /var/log/mp-worker.log 2>&1
  ```
- [ ] Include the nightly backup command from §4 in the same schedule (once a
  day is enough for that one).

---

## 7. Full environment variable checklist

Copy `.env.example` to `.env.production` (or your host's secrets manager) and
fill in every value. **Never commit this file.**

| Variable | Required? | Where to get it |
|---|---|---|
| `DATABASE_URL_OWNER` | Yes (migrations only) | §4 |
| `DATABASE_URL` | Yes | §4 |
| `DATABASE_URL_SYSTEM` | **Yes — do not skip** | §4 |
| `APP_URL` | Yes | Your production domain, e.g. `https://yourdomain.com` |
| `PUBLIC_QR_ORIGIN` | Yes | **Must exactly match the domain printed on every QR code. Do not change after merchants start printing codes** — see §1. |
| `SESSION_SECRET` | Yes | Generate: `openssl rand -base64 32`. Rotating this logs out every active session. |
| `ANALYTICS_SALT_SECRET` | Yes | Generate: `openssl rand -base64 32`. Rotating this is fine — it only affects same-day visitor de-duplication. |
| `STORAGE_DRIVER` | Yes | `r2` in production |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` | Yes if `STORAGE_DRIVER=r2` | §5 |
| `AI_PROVIDER` | No — `none` disables AI cleanly | See §8 |
| `AI_API_KEY`, `AI_MODEL` | Only if `AI_PROVIDER` set | See §8 |
| `SMS_DRIVER` | Yes | `msg91` in production (or another provider you wire up — see `src/modules/notify/sms.ts`) |
| `MSG91_AUTH_KEY`, `MSG91_SENDER_ID` | Yes if `SMS_DRIVER=msg91` | See §9 |

---

## 8. AI provider (optional for launch — the product works without it)

Per `docs/06-AI-ARCHITECTURE.md`, the assistant degrades gracefully with
`AI_PROVIDER=none`: deterministic answers (hours, location, prices, offers)
still work with **zero cost and zero setup**, because they're computed from
data, not a model. Only "open-ended" questions need a real provider. You can
launch with `AI_PROVIDER=none` and turn this on later.

If you want the full assistant:

- [ ] **Read the provider's current commercial-use terms yourself first.**
  This is flagged as unresolved research debt (**U2** in
  `docs/01-MARKET-RESEARCH.md`): sources found during planning **conflicted**
  on whether Google's Gemini free tier permits commercial/revenue-generating
  use. Do not take my earlier research as the final word — check
  Google's/Groq's/Cloudflare's actual current ToS page before connecting a
  key.
- [ ] **Groq is the default and recommended choice** (`AI_PROVIDER=groq`):
  genuinely free tier, no card required, fastest of the three. Get a key at
  https://console.groq.com and set `AI_API_KEY`.
- [ ] **The app has a real fallback chain, not just one provider**
  (`src/modules/ai/provider.ts` → `aiProviderChain`). If you also set
  credentials for a second provider (e.g. add `CLOUDFLARE_ACCOUNT_ID` plus a
  Cloudflare Workers AI key), the assistant automatically tries it if Groq's
  free-tier daily cap is hit or a request fails — you don't need to change
  `AI_PROVIDER` to benefit from this, it tries every provider that has
  credentials configured, in order. If every provider fails or none is
  configured, it falls back to deterministic answers, which need no key at
  all — a missing or exhausted key narrows the answers, it never breaks the page.
- [ ] Optionally set `AI_MODEL` to override the default model per provider
  (see `src/modules/ai/provider.ts` for the defaults).
- [ ] **This was implemented against each provider's documented API but not
  exercised against a live account** (no API keys were available in this
  environment). Test one real question through a merchant's public page
  after deploying, before relying on it.
- [ ] Each merchant's AI toggle defaults **off** for the "medical" category
  and **on** for everything else (`src/modules/db/seed.ts` → `CATEGORIES`) — this
  was a deliberate liability call in `docs/06-AI-ARCHITECTURE.md` §5.3.
  Review this list against your actual merchant mix before launch.

---

## 9. SMS (OTP login)

- [ ] Create an **MSG91** account (or swap in another provider — the driver
  interface in `src/modules/notify/sms.ts` is small and meant to be
  replaceable).
- [ ] Get your Auth Key and a registered Sender ID from MSG91's dashboard.
  **India has DLT (Distributed Ledger Technology) registration requirements
  for transactional SMS** — MSG91 will walk you through registering your
  sender ID and message template with the telecom regulator (TRAI). This is
  a multi-day process; start it early, not the week you plan to launch.
- [ ] Set `SMS_DRIVER=msg91`, `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`.
- [ ] **This was only tested against the console driver** (which just logs
  the code) — no live MSG91 account was available in this environment. Send
  yourself a real OTP through the login page after deploying.
- [ ] Budget for this: **~₹0.14/SMS**, the one genuine per-merchant variable
  cost (`docs/10-COST-MODEL.md`). The rate limits in
  `src/modules/auth/durable-rate-limit.ts` cap this at 3 requests per phone
  per 15 minutes — do not raise this without understanding it directly
  controls your SMS spend exposure.

---

## 10. First login and platform admin setup

- [ ] Log in at `/login` → "Sign in with email instead" using the seeded
  admin credentials from §4.
- [ ] **You will immediately be asked to set up two-factor authentication.**
  This is mandatory for platform admins, not optional — scan the QR code
  shown with Google Authenticator, Authy, or 1Password, then enter the
  6-digit code to confirm. **Save the "manual entry key" shown on that
  screen somewhere durable (a password manager) — if you lose your
  authenticator app before recording it, you lose access to that admin
  account** and will need direct database access to clear
  `users.totp_secret` for that account and re-enrol.
- [ ] Change the seeded password immediately (there is no self-service
  "change password" screen yet in the admin console — set a new one directly:
  ```
  npx tsx -e "
  import { setPassword } from './src/modules/auth/service';
  import { closeDb } from './src/modules/db/client';
  setPassword('<the admin user id>', '<a strong new password>').then(() => closeDb());
  "
  ```
  Find the user id via `SELECT id FROM users WHERE email = 'admin@example.com';`
  using `DATABASE_URL_SYSTEM`.)
- [ ] Create additional platform admin accounts as needed by inserting into
  `platform_admins` directly (there is no self-service admin-invite screen in
  V1 — see `docs/12-KNOWN-ISSUES.md` for what's intentionally out of scope).

---

## 11. Content moderation and abuse prevention

Per `docs/05-API-AND-SECURITY.md` §2.4, this is a **permanence issue, not just
policy**: if the platform is used to host phishing or scam content, the entire
shared domain can get flagged by Google Safe Browsing — breaking every
merchant's QR code simultaneously, not just the offending one.

- [ ] In V1, merchant creation is **admin-gated** (there is no public
  self-serve signup form) — this is deliberate. Keep it that way until you
  have a moderation process, per `docs/09-DECISION-LOG.md` D22.
- [ ] Register your domain with **Google Search Console** and enable Safe
  Browsing status monitoring so you find out about a flag before your
  merchants do.
- [ ] Decide on and publish a content policy (what a merchant may and may not
  put on their page) — this is a legal document, see §13.

---

## 12. Monitoring and error tracking

- [ ] **Error monitoring**: `src/app/error.tsx` and the API routes log to
  stderr/console today, with a comment marking exactly where to wire in a
  real error monitor. Sign up for **Sentry** (free tier is generous — 5k
  errors/month) or an equivalent, add `@sentry/nextjs`, and follow their
  Next.js setup guide (it adds its own instrumentation files).
- [ ] **Uptime monitoring**: use **UptimeRobot** or **Better Stack** (both
  have free tiers) to hit `https://yourdomain.com/api/health` every 1–5
  minutes. This endpoint checks a real database round-trip, not just "the
  process is running" — see `src/app/api/health/route.ts`.
- [ ] **The single most important monitor**: a synthetic check that actually
  scans a real, canonical merchant QR URL end-to-end every few minutes
  (`docs/03-ARCHITECTURE.md` §J). Set this up against one of your own
  merchant pages — most uptime tools support "check for text X on page Y",
  point it at your business name on a live merchant page.
- [ ] **Domain expiry monitoring** — most uptime tools also support SSL/domain
  expiry checks; turn this on in addition to the calendar reminder in §1.

---

## 13. Legal (do this before onboarding real merchants, not after)

None of this exists in the codebase — it's paperwork, and I have no authority
to write binding legal terms for your business.

- [ ] **Privacy policy** covering what you collect (merchant contact info,
  privacy-first analytics with rotating-salt hashes — see
  `docs/03-ARCHITECTURE.md` §G for the exact technical description to base it
  on) and DPDP Act (India's data protection law) obligations: consent
  notices, a grievance officer contact, breach reporting procedure.
  **Consult an actual lawyer for this** — `docs/05-API-AND-SECURITY.md` §2.3
  flags DPDP compliance as unresolved and explicitly not something the
  architecture doc can settle on its own.
- [ ] **Terms of service** for merchants, including your content policy
  (§11) and what happens to a merchant's data/slug on account closure (per
  the permanence guarantee, their old QR will show a "no longer listed" page
  forever — make sure your terms actually say this, since it's a real
  product behavior, not just a technical detail).
- [ ] **Business registration / GST** — if you're charging money in India,
  you likely need GST registration once past the threshold turnover.
  Consult an accountant; this is entirely outside what this codebase can
  advise on.
- [ ] **Payment gateway agreement** — not yet integrated (subscriptions table
  exists in the schema but billing is post-V1, see
  `docs/02-PRODUCT-SPEC.md` §4). When you add this, Razorpay/Cashfree are the
  common India-first choices; that integration and its own compliance
  requirements (PCI scope, etc.) are future work.

---

## 14. CI/CD

`.github/workflows/ci.yml` already runs typecheck, lint, the full test suite
(including the tenant-isolation and AI-security suites against a real
Postgres service container) and a production build on every push/PR. To use
it as a deploy gate:

- [ ] If deploying via GitHub Actions, add a deploy job that runs after `test`
  succeeds, using your host's deploy method (`docker build && docker push` to
  a registry, then pull on your VPS; or your PaaS's GitHub integration).
- [ ] No secrets need to be added to GitHub Actions for the **test** workflow
  itself — it uses disposable, hardcoded test credentials for its own
  throwaway Postgres container. Only add real secrets (`DATABASE_URL`,
  `R2_*`, etc.) if you extend the workflow to actually deploy.

---

## 15. Before you tell anyone this exists: a manual browser check

Everything above is either automated or has an automated test. **One thing
genuinely is not, and needs a human with a real browser**:

- [ ] Open the merchant dashboard (`/app`) and admin console (`/admin`) in a
  real browser with dev tools open, and check the Console/Network tab for
  **Content-Security-Policy violation reports**. The nonce-based CSP in
  `src/proxy.ts` was verified end-to-end against a live server at the HTTP
  level (Next's own scripts do carry the matching nonce — confirmed by
  inspecting real response headers and HTML), but a subtly wrong CSP
  directive can still silently break one specific piece of client-side
  interactivity that only shows up as a browser console warning, not a
  failed HTTP request. Click through: login (both OTP and password+TOTP),
  every dashboard screen, every admin screen, before considering this done.
- [ ] Scan a real printed QR code with a real phone on a real mobile network
  once, start to finish, before your first real merchant does.

---

## 16. Launch checklist (final pass)

- [ ] Domain registered, auto-renew + lock on, 2FA on the registrar account
- [ ] Hosting deployed and reachable over HTTPS
- [ ] `DATABASE_URL_SYSTEM` explicitly set (not falling back to `DATABASE_URL`)
- [ ] Migrations run, seed run, admin password changed, admin TOTP enrolled
- [ ] R2 storage tested with one real photo upload
- [ ] SMS tested with one real OTP to your own phone
- [ ] `npm run worker` scheduled hourly; nightly backup scheduled and **restored once**
- [ ] Sentry (or equivalent) receiving real errors
- [ ] Uptime monitor hitting `/api/health` and a real merchant page
- [ ] Privacy policy and terms of service published and linked from the public page footer
- [ ] Merchant content moderation process decided (who reviews, how fast)
- [ ] Manual CSP/browser check done on every screen (§15)
- [ ] One real QR code printed and scanned on a real phone
- [ ] Walk through the newer admin screens once: Settings (categories/plans/
  flags), Audit log, and on the merchant side Team and Plan & billing —
  everything is live-tested against the database but confirm they match your
  actual category list and pricing before merchants see them

Once every box is checked, you're production-live. Everything after this is
in `docs/08-V1-IMPLEMENTATION-PLAN.md` Phase 7 (pilot launch, 25 real
merchants, weekly interviews) and the roadmap in `docs/02-PRODUCT-SPEC.md` §5.
