# 08 — V1 Implementation Plan & Checklist

Phase gates are **blocking**: do not start a phase until the previous one's gate passes.

---

## PHASE 0 — Validation (before any production code)

**This phase is cheap, fast, and the highest-value work in the plan.** Everything in the positioning
and pricing sections is currently hypothesis.

- [ ] **P0-1 — Competitive teardown of Vyaparify / HDFC "My Business QR"** *(blocking)*
      Sign up or obtain a demo. Document: pricing, eligibility (non-HDFC merchants?), catalog CRUD
      depth, dashboard usability, language support, QR permanence semantics, data export.
      → Closes research debt **U1**. *This one task most de-risks the venture.*
- [ ] **P0-2 — 10–15 merchant interviews** *(blocking)* across barber, grocery, restaurant,
      clothing, wholesale. Test: willingness to pay ₹149; appetite for ₹999–2,499 setup service;
      whether permanence/independence resonates; whether they can self-onboard.
      → Closes **U7, U8, U9, U10**.
- [ ] **P0-3 — Watch 5 merchants attempt self-signup** on a clickable prototype → decides whether
      assisted onboarding is V1 or V2.
- [ ] **P0-4 — Read Google Gemini + Cloudflare ToS directly** on commercial use of free tiers.
      → Closes **U2, U3**. Determines the launch AI provider and the ₹0 hosting track.
- [ ] **P0-5 — Verify DotPe / Bikayi pricing; get 3 local web-developer quotes** → **U4, U5, U6**.
- [ ] **P0-6 — Register the domain.** Max term, auto-renew, registrar lock, 2FA, expiry alerts.
      *The only mandatory spend; do it now because everything depends on it.*

**GATE:** positioning and pricing either confirmed or explicitly revised in writing. If merchants
will not pay for any tier, **stop and rethink the model before building.**

---

## PHASE 1 — Foundation

- [ ] Monorepo (pnpm workspaces), TypeScript strict, ESLint + Prettier
- [ ] Module boundary lint rules; **`no-direct-db-import` rule** (only `packages/db`, `packages/tenancy`)
- [ ] Next.js 15 app, Tailwind, shadcn/ui base, design tokens
- [ ] Postgres (Neon) + Drizzle + migration tooling
- [ ] Core schema: tenants, merchant_slugs, users, memberships, platform_admins, sessions, categories
- [ ] **RLS policies + forced RLS + non-BYPASSRLS app role**
- [ ] **`packages/tenancy` — `TenantScope`, the single data-access chokepoint**
- [ ] Auth: phone-OTP, sessions, password fallback, admin TOTP
- [ ] `authorize()` + 4-role RBAC
- [ ] **Isolation test harness + first tests** (two tenants, cross-access denied)
- [ ] CI: typecheck, lint, unit, integration, isolation suite, migration dry-run
- [ ] Sentry + uptime monitoring wired
- [ ] Dockerfile (portability insurance from day one)

**GATE:** isolation suite green; RLS provably blocks a deliberately un-scoped query; CI blocking.

---

## PHASE 2 — Merchant content

- [ ] Schema: business_profiles, business_hours, business_holidays, catalog_groups, catalog_items, offers, media
- [ ] Composite FKs + RLS + isolation tests for every new table
- [ ] Platform admin: create/edit merchant, slug allocation (reserved list, collision, validation)
- [ ] Merchant dashboard shell (mobile-first, bottom nav)
- [ ] Profile + contact + hours (split shifts, holidays) editors
- [ ] Catalog CRUD: price / range / on-request, unit, duration, groups, reorder, availability, MOQ + bulk tiers
- [ ] Offers CRUD + schedule presets + **computed status** (unit-tested across timezone/DST edges)
- [ ] Media: upload → magic-byte validation → EXIF strip → `sharp` → AVIF/WebP ×3 → R2 (tenant-prefixed keys)
- [ ] Audit logging on identity/role/slug/plan/suspension changes
- [ ] Empty/loading/error/offline states

**GATE:** a merchant can be created and fully populated from a phone; isolation tests cover all new
tables; offer status correct across date/time/weekday boundaries.

---

## PHASE 3 — Permanent QR + public page *(the core)*

- [ ] `merchant_slugs` rules enforced: **no reuse, no delete (trigger), one primary, forever-301 aliases**
- [ ] Public page `/m/{slug}` — RSC, SSR + ISR, on-demand revalidation on merchant save
- [ ] Alias 301; suspended / deleted (410) / unpublished / 404 branded states
- [ ] `/q/{token}` short alias → 301
- [ ] Vertical templates as configuration
- [ ] CTAs as plain anchors (tel / wa.me / maps / website / social / share / vCard)
- [ ] Open-now computation in tenant timezone
- [ ] QR render: PNG / SVG / **print-ready A5 standee PDF**; EC level Q with logo, M without; quiet
      zone enforced; contrast validation; **server-side decode verification before download**
- [ ] SEO: metadata, OG image, LocalBusiness JSON-LD, canonical, sitemap, robots
- [ ] Performance: JS budget test, Lighthouse CI, real low-end Android test
- [ ] **Static edge fallback page** for total-outage scenarios
- [ ] Synthetic monitor: scan a canonical QR URL end-to-end every 5 minutes

**GATE (the product's core promise — test explicitly):**
- [ ] Change content → **same URL, same QR**, updated page within seconds
- [ ] Rename business → new slug, **old printed URL still resolves** (301)
- [ ] Suspend/delete → graceful branded page, **never a 404 or a wrong merchant**
- [ ] LCP <2.0 s on throttled 3G / low-end Android
- [ ] Every generated QR decodes to the expected URL
- [ ] Page fully functional with JavaScript disabled

---

## PHASE 4 — Analytics + the retention loop

- [ ] `analytics_events` (monthly partitions) + `analytics_daily` rollups
- [ ] Beacon endpoint, rate-limited, `sendBeacon`, zero blocking
- [ ] Daily-rotating visitor hash; **no cookies, no IP storage, no PII** — verified by test
- [ ] Rollup job via `outbox` worker; 90-day partition drop
- [ ] Merchant Insights screens (plain language, four questions)
- [ ] **Monthly merchant report** (WhatsApp/SMS/email) — *retention mechanism, in V1 scope*
- [ ] Platform analytics for admin

**GATE:** privacy audit passes (no cookie, no PII, hashes non-correlatable across days/tenants);
merchant can answer "is my QR bringing customers?" in under 10 seconds.

---

## PHASE 5 — AI assistant *(cut if it threatens Phases 1–4)*

- [ ] `AiProvider` interface + mock provider for tests
- [ ] **Deterministic short-circuits** (open?, where?, today's offer?) — no model call
- [ ] Pre-computed FAQ at publish time
- [ ] Structured context builder (single tenant-scoped query, token-budgeted)
- [ ] Answer cache keyed by tenant + normalised question + `context_version`
- [ ] Rate limits + per-plan quotas + kill switch
- [ ] Guardrails: fenced untrusted blocks, output filtering, "I don't know" behaviour, category
      restrictions (medical off by default)
- [ ] **Adversarial test corpus in CI** — cross-tenant extraction, injection, malicious merchant
      instructions, hallucination probes
- [ ] Customer-question insights surfaced to merchant

**GATE:** zero cross-tenant leaks and zero fabricated prices in the adversarial suite; cache hit
rate instrumented. *If the launch provider's ToS is unresolved, ship the deterministic + FAQ path
only — it needs no provider and still answers the most common questions.*

---

## PHASE 6 — Production hardening

- [ ] Full security checklist (`05` §2.5) signed off
- [ ] Penetration pass on tenant isolation, auth, uploads, AI
- [ ] Backups: provider PITR **+ independent nightly `pg_dump` to R2**; **restore drill performed**
- [ ] Load test at 100× expected traffic on the public page
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Runbooks: incident, restore, domain emergency, provider migration, abuse takedown
- [ ] Alerting: public-page uptime, error rate, DB, AI quota, **domain expiry**
- [ ] Legal: DPDP review, terms, privacy policy, merchant content policy

**GATE:** restore drill succeeded; isolation pen-test clean; uptime alerting verified by a
deliberately induced failure.

---

## PHASE 7 — Pilot launch

- [ ] Onboard 25 real merchants (ideally one dense cluster — a single market or street)
- [ ] Print and place real standees
- [ ] Measure activation, scans, CTA rate, LCP in the field
- [ ] Weekly interviews with all 25
- [ ] Iterate onboarding based on observed failure points

**GATE:** >70% activation, >60% weekly CTA rate, no permanence incidents → only then discuss pricing
and scale.

---

## Living documents (maintained throughout, per the brief)

`09-DECISION-LOG.md` · `11-FEATURE-CHECKLIST.md` · security checklist (`05` §2.5) ·
testing checklist (below) · `12-KNOWN-ISSUES.md` · `13-FUTURE-IMPROVEMENTS.md`

## Testing strategy

| Layer | Coverage |
|---|---|
| Unit | Domain logic: offer status (timezone/DST/weekday edges), price formatting, slug validation, hours computation |
| Integration | Repositories under RLS; migrations; outbox worker |
| **Tenant isolation** | **Every table × every route × read/list/update/delete. Blocking. 100%.** |
| API | Auth, RBAC matrix per role, validation, rate limits |
| E2E | Onboarding → publish → QR → scan → page; edit → same QR, new content |
| QR | Decode verification; EC levels; small-size scan test on real devices |
| Performance | Lighthouse CI budgets; JS size budget; load test |
| Security | Injection, XSS, CSRF, upload fuzzing, enumeration, privilege escalation |
| AI | Adversarial corpus; zero leaks; zero fabricated prices |
| Accessibility | axe in CI + manual screen-reader pass |

**Two suites can never go red:** tenant isolation, and the QR-permanence E2E test.
