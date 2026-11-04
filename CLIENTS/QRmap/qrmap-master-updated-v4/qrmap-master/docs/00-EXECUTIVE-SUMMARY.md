# 00 — Executive Summary & Strategic Challenge

**Date:** 2026-09-16
**Status:** Phase 0 — Research complete, architecture defined, pre-implementation
**Label convention used throughout these docs:**
`[FACT]` = verified against a cited source · `[INTERPRETATION]` = analyst synthesis from sourced signals · `[HYPOTHESIS]` = our unverified assumption, must be tested

---

## 1. What we are building (one paragraph)

A multi-tenant SaaS platform that gives every offline business a **permanent digital identity** —
a stable public URL and a printable QR code that never changes — behind which the merchant can
edit their profile, catalog, offers, hours and contact actions at any time from a phone. The QR is
the entry point, not the product. The product is the permanent, merchant-owned digital presence
layer that later carries a website, an AI assistant, and business software modules on the same data.

---

## 2. The three things research says you should change

This is the most important section in the entire plan. Everything else is execution detail.

### CHALLENGE 1 — Your product already exists, and it has bank-scale distribution

**[FACT]** In October 2025, HDFC Bank launched **"My Business QR," powered by Vyaparify** — an
AI-powered platform where a merchant registering via HDFC SmartHub Vyapar gets an instantly
generated permanent digital storefront (hosted at `h-id.vyaparify.com`). Scanning the merchant's QR
lets a customer discover the merchant, view products/services, chat via WhatsApp, and save the
contact to their phonebook. It is explicitly positioned as giving India's small merchants "their
first commerce identity."
Sources: [Tribune India](https://www.tribuneindia.com/news/business/hdfc-bank-launches-countrys-first-my-business-qr-powered-by-vyaparify-giving-bharats-smes-their-first-commerce-identity/),
[Syllad](https://www.syllad.com/hdfc-bank-launches-my-business-qr-indias-first-instant-digital-storefront-for-small-merchants/)

That is your product vision, near-verbatim, shipped 11 months ago, distributed through a bank that
already has a payment QR standee sitting on the counter of millions of Indian merchants.

**[INTERPRETATION]** This does not kill the idea. It validates it — someone with real market
research money reached the same conclusion. But it decisively reframes the problem:

> **The hard problem is not building the product. It is distribution.**
> The product is a 6–10 week build. Vyaparify's advantage is that HDFC's field agent is already
> standing in the shop installing a payment QR. You cannot out-feature that. You have to out-
> distribute it in the segment it does not reach.

**What this changes in the plan:**
- Distribution strategy is promoted to a **first-class deliverable**, not an afterthought (see §8).
- We deliberately target the merchant segments a bank-gated product structurally cannot serve:
  merchants who are not HDFC current-account holders, merchants who want a page independent of
  their payment provider, and — critically — **multi-merchant aggregators** (market associations,
  mall/complex owners, distributor networks, franchise groups) who onboard 50–500 merchants at once.
- **Before we write production code**, we must sign up for / obtain a demo of My Business QR and
  document exactly what it does and does not do. This is a blocking task (P0-1 in the checklist).
  Its pricing, catalog depth, dashboard usability, language support, and whether non-HDFC merchants
  can sign up at all are all **unverified** and are the single highest-value unknowns in this plan.

### CHALLENGE 2 — "₹0 infrastructure" is achievable, but the naive free stack is a trap

You asked for as close to ₹0 as realistically possible. Research found that the *obvious* free
stack is actively unsafe for this specific product:

| Service | The trap | Source |
|---|---|---|
| **Vercel Hobby** | Free tier **explicitly prohibits commercial use** — SaaS apps, e-commerce and client projects require Pro at $20/mo. Building a commercial merchant platform on Hobby is a ToS violation, i.e. a platform that can be terminated without warning. | [DeployWise](https://deploywise.dev/blog/vercel-free-tier-limits-2026) |
| **Supabase Free** | Projects **auto-pause after 7 days of inactivity**. Combined with our product, this is catastrophic: a low-traffic merchant's printed QR would resolve to a dead page. A paused DB means every printed QR in that shop is broken. | [jetadmin.io](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/) |
| **Render free Postgres** | Database is **deleted after 30 days**. Disqualified outright — we are storing the permanent identity of businesses. | [srvrlss.io](https://www.srvrlss.io/provider/render/) |
| **Railway** | No real free tier — one-time ~$1 credit then normal billing. | [swyftstack.com](https://swyftstack.com/blog/free-postgresql-hosting) |
| **Gemini API free tier** | Sources **conflict** on whether commercial/revenue-generating use is permitted. Must be verified against Google's own ToS before we depend on it. | [ai.google.dev](https://ai.google.dev/gemini-api/docs/rate-limits) |

**[INTERPRETATION]** The governing constraint for this product is not cost, it is **permanence**.
A merchant prints your QR on a banner, a menu card, 5,000 paper bags and a shop shutter. If that URL
ever 404s, you have not had an outage — you have destroyed the merchant's physical investment and
your own credibility, permanently. **Uptime is the product.** Free tiers that pause, expire, delete,
or forbid commercial use are therefore not cheap — they are an unpriced liability.

**Recommendation — reject the pure-₹0 target, adopt a ₹0 pilot / ~₹500-per-month production split:**

- **Track A — Pilot (truly ₹0/mo, up to ~50 merchants, pre-revenue):**
  Cloudflare Workers/Pages (free, 100k req/day) + **Neon** Postgres (free tier, **commercial use
  allowed, no expiry, no auto-pause** — the only Postgres free tier that survives scrutiny
  [[getautonoma.com](https://getautonoma.com/blog/neon-database)]) + **Cloudflare R2** (10 GB
  storage, 1M writes, 10M reads, **zero egress fees** [[freetier.co](https://freetier.co/directory/products/cloudflare-r2)]).
  Only unavoidable cost: **the domain, ~₹900–1,500/year.**
- **Track B — Production (from first paying merchant, ~₹400–900/mo):**
  Same application code, moved to a single Hetzner/DigitalOcean VPS or Neon paid + Cloudflare Workers.
  No rewrite — this is why the architecture is a **portable modular monolith with zero proprietary
  runtime dependencies** (§03).

**The one non-negotiable spend is the domain.** It is the single most critical asset in the company:
every printed QR in the field depends on it. It must be registered for the maximum term, on
auto-renew, with registrar-lock and a calendar alarm. Full cost model in `10-COST-MODEL.md`.

### CHALLENGE 3 — Skip the vector database. Your AI problem is not a RAG problem.

Your brief asks for "knowledge documents/chunks if needed" and a retrieval pipeline with strict
tenant isolation. **Research and arithmetic say do not build this.**

A single merchant's entire knowledge base — profile, hours, location, 20 services, 40 products,
5 offers, social links — serializes to roughly **1,500–4,000 tokens**. That fits comfortably inside
a single model context window. There is nothing to retrieve.

**[INTERPRETATION]** Introducing pgvector, an embedding pipeline, chunking, and a similarity search
here would add an entire subsystem, a per-write embedding cost, an embedding-model dependency, and
— worst of all — a **new class of cross-tenant leak** (a mis-scoped similarity search returning
another merchant's chunk). It buys nothing, because the alternative retrieves with 100% recall.

**Recommended AI architecture — "structured context injection":**

```
customer question
   → resolve tenant from URL (server-side only, never from client input)
   → ONE parameterised SQL query: SELECT ... WHERE tenant_id = $1
   → deterministically serialise that tenant's rows into a context block
   → LLM call: [system rules] + [that tenant's context] + [user question]
   → answer, or an explicit "I don't have that information"
```

Cross-tenant leakage becomes **structurally impossible rather than probabilistically unlikely**:
the model is never given data from more than one tenant, because the context is built from a single
tenant-scoped query whose parameter comes from the server's own URL resolution. This is a stronger
security guarantee than any RAG system can offer, and it is *less* code.

We keep the `ai_provider` abstraction you asked for (swap Gemini → Groq → Cloudflare Workers AI →
self-hosted) and add aggressive answer caching, because **[FACT]** free tiers are rate-limited
per-org, not per-tenant (Gemini: 1,500 req/day, 15 RPM; Groq: 14,400 req/day org-wide), so a
multi-tenant chatbot exhausts them quickly without caching and per-tenant throttling.

Vector search gets revisited only when a tenant's knowledge exceeds ~15k tokens (a large wholesaler
with 2,000 SKUs). The schema is designed so it can be added later without migration pain.

---

## 3. Positioning — the honest version

Your proposed positioning is *"One permanent digital identity for every offline business."*

**[INTERPRETATION]** It is a genuinely good articulation of the vision, but it is **not a
differentiator** — it is exactly what Vyaparify/HDFC says, and it is what Google Business Profile
effectively delivers for free. A merchant cannot tell these apart from a pitch.

Differentiation has to come from something a competitor *structurally cannot copy*. Three candidates
survived research:

1. **Provider independence.** **[FACT]** Vyaparify's storefront is bank-distributed; DotPe hides
   pricing behind sales calls; Linktree takes 9% and has no UPI. **[HYPOTHESIS]** A page tied to
   your bank dies when you switch banks. "Your page, your data, your QR — works no matter who you
   bank with, exportable, yours forever" is a real, defensible promise. Needs validation with
   merchants; they may not care until they've been burned once.
2. **The aggregator wedge.** No scanned competitor is built for onboarding a *whole market* at once
   — 200 shops in a wholesale complex, a trade association's members, a distributor's retailer
   network — with a parent-level dashboard. This is both a differentiated product surface
   (multi-tenant-group) and the cheapest distribution channel available to a small team.
3. **Radically lower setup friction than any of them.** **[INTERPRETATION]** Every competitor
   scanned assumes a merchant who can type. The genuinely underserved user is the tier-2/3 merchant
   with low literacy who will never complete a 12-field form. A WhatsApp-driven / voice / assisted
   onboarding where the merchant *says* what their shop does and we generate the page is a real
   product gap — and it is the one place where an LLM earns its keep in V1.

**Recommended positioning to test (not to commit):**

> **"Your shop's permanent digital address — set up in 5 minutes, works forever, yours to keep."**

We commit to this only after the merchant interviews in Phase 0.5.

---

## 4. The hard question: why would they pay every month?

You asked for a concrete, non-generic answer. Here it is, and part of it is uncomfortable.

**[INTERPRETATION] A QR profile page alone will not sustain a monthly subscription.** The merchant
cannot perceive its value — it is passive, and its benefit ("customers saw my offer") is invisible
and unattributable. Merchants churn off invisible value. Every QR-page product that charges for
the page alone is fighting this.

**[INTERPRETATION]** Indian small merchants demonstrably do pay monthly/annually for four things:
1. Something that **brings a visible, countable lead** (a call, a WhatsApp message they can point at)
2. Something that **saves money or time** (billing/GST — Vyapar sells this successfully)
3. Something that **replaces a larger one-time cost** (a local developer charges ₹10,000–25,000 for
   a website; ₹199/mo reframes that) — *[FACT to verify: local web dev pricing, from primary quotes]*
4. Something **a trusted party told them to buy** (their bank, their distributor, their association)

**Therefore the business model inverts your draft:**

> **The QR page and profile are FREE FOREVER.** They are the acquisition engine, the data moat and
> the retention hook — not the product being sold. **Revenue comes from the layers above it.**

| Tier | Price (hypothesis, to validate) | What it contains | Why they'd pay |
|---|---|---|---|
| **Free** | ₹0 forever | Permanent QR + URL, profile, hours, catalog (capped), 3 active offers, call/WhatsApp/directions buttons, basic scan counts | Acquisition. Never charge for this. |
| **Growth** | ₹149/mo *(hypothesis)* | Unlimited catalog, unlimited offers + scheduling, **lead inbox** (every WhatsApp/call click logged with time), full analytics, AI assistant, remove our branding | They can *count* the leads. Visible, attributable value. |
| **Business** | ₹399/mo *(hypothesis)* | Website on own domain, multi-branch, staff logins, customer/lead CRM, priority support | Replaces a ₹15,000 one-time website spend. |
| **Setup service** | ₹999–2,499 one-time | We/an agent photograph the shop, write the copy, build the page, deliver a printed QR standee | **[INTERPRETATION]** In this market this is likely the *largest early revenue line* and doubles as the distribution mechanism. |

**What makes a merchant stop paying** (design the product against these):
- They see no leads for 30 days → **mitigation:** monthly WhatsApp "your page report" with absolute
  numbers; if numbers are bad, the product prompts a concrete fix (add photos / post an offer).
- Their content goes stale and the page becomes embarrassing → **mitigation:** offers auto-expire so
  the page is never *wrong*; proactive nudges to refresh.
- Setup was too hard, they never finished → **mitigation:** assisted onboarding; a page is never
  half-built and public.
- Seasonal cash crunch → **mitigation:** annual plans at a discount; downgrade to Free rather than
  delete, so the QR keeps working and they can return.
- **The single biggest churn risk: they forget the product exists.** A page they never log into is a
  subscription they will cancel. **Mitigation: the monthly report is not a nice-to-have, it is the
  core retention mechanism and is in V1 scope.**

---

## 5. MVP — what we build

Deliberately narrower than your draft V1.

**IN:**
- Platform admin: create/suspend/manage merchants, categories, plans, feature flags
- Merchant auth (phone-OTP primary) + RBAC (4 roles)
- Merchant dashboard (mobile-first): profile, hours, location, contact links
- **Unified catalog** (services *and* products in one table — see Challenge 4 below)
- Offers with automatic lifecycle (draft → upcoming → active → expired)
- Media upload with server-side image processing
- **Permanent QR + public page** (the core; §R)
- Privacy-first analytics + **the monthly merchant report**
- AI assistant (structured-context, cached, rate-limited) — included because with the architecture
  above it is ~3 days of work, not 3 weeks, and it is the best demo asset we have

**OUT of V1** (explicitly, with the reason):
POS, payments, inventory, booking/appointments, full e-commerce/cart, loyalty, website builder,
multi-branch, staff scheduling, CRM, review management, vector/RAG search, native mobile app,
multi-language UI *(i18n is architected in V1, translations ship in V2)*.

**CHALLENGE 4 — merge `products` and `services` into one `catalog_items` table.** They differ by a
single boolean in practice (a service has no stock, a product has no duration). Two tables would
mean two CRUD screens, two APIs, two AI context builders, and two sets of bugs, for no user benefit.
One table with a `kind` enum and type-specific optional columns handles barber (services),
grocery (products) and wholesaler (products + MOQ) identically. Detail in `04-DATABASE.md`.

---

## 6. Recommended stack (full justification in `03-ARCHITECTURE.md`)

| Layer | Choice | Primary reason |
|---|---|---|
| App | **Next.js 15 (App Router) + TypeScript** | One codebase for public SSR pages + dashboard + API; ISR makes public pages near-instant; huge talent pool |
| UI | **Tailwind + shadcn/ui** | Owned components in-repo, no dependency risk, fast |
| DB | **PostgreSQL** (Neon free → managed/self-hosted paid) | RLS gives DB-level tenant isolation; no lock-in; only free tier that permits commercial use and doesn't pause/expire |
| ORM | **Drizzle** | SQL-first, edge-compatible, no proprietary engine, transparent queries for RLS work |
| Auth | **Self-hosted (Auth.js/custom sessions), phone-OTP primary** | No vendor lock-in on identity; email/password is a bad fit for this user |
| Storage | **Cloudflare R2** | 10 GB free, **zero egress**, S3-compatible so migration is trivial |
| Images | **`sharp` on upload → 3 sizes → R2** | Free, no per-image vendor cost, full control |
| QR | **`qrcode` npm, generated server-side** | Zero vendor, zero cost, zero dependency on a QR SaaS that could disappear |
| Analytics | **First-party events in Postgres + rollups** | Privacy-first (DPDP), no third-party, we own the data that powers the retention report |
| AI | **Provider-abstracted; Gemini Flash / Groq / CF Workers AI** | Swappable by design; free tiers are rate-limited org-wide so caching is mandatory |
| Hosting | **Cloudflare Workers/Pages → VPS** | Avoids Vercel Hobby's commercial-use prohibition |
| Email/SMS | Resend or Brevo free tier; MSG91 for OTP | OTP SMS ≈ ₹0.14 each — the one true per-merchant variable cost |
| Monitoring | Sentry free + UptimeRobot/Better Stack free | Uptime alerting is mandatory, not optional, for this product |

**Explicitly rejected:** Vercel Hobby (ToS), Supabase (auto-pause + auth lock-in), Render/Railway
free Postgres (deletion/no free tier), any paid QR SaaS (Uniqode is $5–99/mo *per account* with
per-code limits — economically absurd when we need one code per merchant at 10k merchants),
microservices (premature), a vector DB (see Challenge 3).

---

## 7. QR architecture — the one thing we cannot get wrong

Summary here; full design in `03-ARCHITECTURE.md` §R.

- QR encodes **`https://{domain}/m/{slug}`** — human-readable (builds trust when printed under the
  code, works for SEO and word-of-mouth sharing), not an opaque token.
- **Slugs are immutable by default and never reused, ever.** Renaming mints a *new* primary slug and
  the old one 301-redirects to it **forever**, from a `merchant_slugs` table. A slug is never
  released back into the pool even if a merchant is deleted — that would silently point an old
  printed QR at a stranger's business, which is the worst failure this system can have.
- **"Regenerate QR" regenerates only the image** (size/format/logo/style). The encoded URL is
  immutable. Re-pointing a printed QR is a separate, platform-admin-only, explicitly-warned
  destructive action, disabled by default.
- Suspended/deleted merchants get a **graceful branded page**, never a 404 and never a redirect to
  someone else.
- Error correction **level Q** with a logo, **M** without; 4-module quiet zone; short slugs keep
  module count low so the code still scans at 2 cm and from a distance on a banner.
- The domain is treated as a permanent liability we have accepted: max-term registration,
  auto-renew, registrar lock, monitored expiry.

---

## 8. Distribution plan (elevated to a core deliverable — see Challenge 1)

**[HYPOTHESIS — all of this needs field validation before we spend money on it]**
The product is copyable; the channel is not. Four channels ranked by cost-to-test:

1. **Aggregator/association wedge** — one conversation onboards 50–500 merchants. Cheapest CAC
   available. Drives the `merchant_group` concept in the schema (built in V1 as a nullable parent,
   surfaced in V2).
2. **Commission agent network** — local agents sell the ₹999 setup service shop-to-shop and keep a
   cut. Matches how this market actually buys. Requires the setup-service product line to exist.
3. **The printed standee as its own billboard** — every merchant's QR standee carries a small "get
   yours" line. Near-zero marginal cost, compounding.
4. **Category-cluster land-grab** — saturate one market/street/category in one town, then use it as
   the reference case. Density beats breadth for word-of-mouth.

Paid ads are explicitly *not* in the early plan; **[INTERPRETATION]** CAC via ads almost certainly
exceeds the LTV of a ₹149/mo merchant in this segment.

---

## 9. Top risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Vyaparify/HDFC or a similar bank-backed player owns the segment before we get traction** | Critical | Aggregator + non-bank wedge; do the competitive teardown *before* coding (P0-1) |
| R2 | **A printed QR stops resolving** (domain lapse, DB pause, hosting termination) | Critical | Domain auto-renew + lock; reject pausing/expiring free tiers; uptime alerting from day 1; static fallback page |
| R3 | **Cross-tenant data leak** | Critical | Defence in depth: tenant-scoped repository layer + Postgres RLS + mandatory automated isolation tests in CI |
| R4 | **Merchants sign up free and never convert** | High | Free tier is deliberately valuable but the *countable lead inbox* and report sit behind Growth |
| R5 | **Churn from invisible value** | High | Monthly report is V1 scope, not V2 |
| R6 | **Free AI tier rate-limits or ToS change** | Medium | Provider abstraction + caching + per-tenant throttling; verify Gemini commercial ToS before depending on it |
| R7 | **Solo/small team overbuilds and never ships** | High | Ruthless V1 scope above; future phases are architected-for, not built |
| R8 | **DPDP Act compliance** (India's data protection law) | Medium | Privacy-first analytics by design: no cookies, daily-rotating visitor hashes, no PII from customers |

---

## 10. Success metrics

- **Activation:** % of created merchants who reach a *published* page with ≥1 offer and ≥3 catalog
  items within 24h. Target **>70%** — below this, onboarding is broken.
- **The product's core claim:** median public-page **LCP on a throttled 3G, low-end Android**.
  Target **<2.0 s**. This is a hard gate on release.
- **Real usage:** scans per merchant per week, and **% of merchants with ≥1 CTA click per week**
  (this, not scan count, is the honest measure of whether the QR brings customers).
- **Retention:** month-3 logo retention of paying merchants. Target **>85%**.
- **Distribution:** CAC by channel, and merchants-per-aggregator-deal.
- **Isolation:** cross-tenant test suite green on every commit — non-negotiable, always 100%.

---

## 11. What happens next

1. **P0-1 (blocking):** competitive teardown of Vyaparify/My Business QR + verify the unverified
   items listed in `01-MARKET-RESEARCH.md`.
2. **P0-2 (blocking, cheap, highest-value):** talk to 10–15 real merchants across barber, grocery,
   restaurant, clothing, wholesale. Validate willingness-to-pay, the ₹149 price point, the lead-
   inbox hypothesis, and onboarding literacy assumptions. **Everything in §3, §4 and §8 is
   currently hypothesis.** This is a few days of work that could save months of building the wrong
   thing.
3. Then Phase 1 implementation per `08-V1-IMPLEMENTATION-PLAN.md`.

**Recommendation: do not start coding before P0-1 and P0-2.** Not because the architecture is
uncertain — it is settled and documented — but because the *positioning and pricing* are entirely
hypothesis, and they determine what we build first.
