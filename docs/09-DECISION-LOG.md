# 09 — Decision Log

Living document. Every significant decision, its alternatives, and why. Append, never rewrite —
if a decision is reversed, add a new entry superseding the old one.

| # | Decision | Alternatives rejected | Reason | Status |
|---|---|---|---|---|
| D1 | **Modular monolith**, one Next.js app | Microservices; function-per-endpoint | No independent scaling axis; keeps the tenant-isolation layer in one auditable place | Settled |
| D2 | **Next.js 15 + TypeScript** | Astro (+ separate dashboard); SvelteKit; API+SPA | Astro was the closest call — better raw public-page perf, but splits the codebase and duplicates tenancy. Next.js RSC + ISR captures most of the benefit in one codebase | Settled |
| D3 | **PostgreSQL** | MySQL; MongoDB; PlanetScale | RLS provides database-enforced tenant isolation — no alternative offers an equivalent | Settled |
| D4 | **Shared schema + `tenant_id` + RLS** | DB-per-tenant; schema-per-tenant | Only model that reaches 100k tenants on a small team; isolation risk bought back with 4 defence layers | Settled |
| D5 | **Drizzle ORM** | Prisma; Kysely; raw SQL | Predictable auditable SQL; edge-compatible; no engine binary; works cleanly with `SET LOCAL` for RLS | Settled |
| D6 | **Neon** for Postgres | Supabase; Render; Railway | Supabase **auto-pauses after 7 days idle** → dead printed QRs. Render **deletes after 30 days**. Railway has no real free tier. Neon: no expiry, no pause, commercial use allowed | Settled |
| D7 | **Not Vercel** for hosting | Vercel Hobby; Vercel Pro | **[FACT]** Hobby explicitly prohibits commercial use. Pro at $20/mo is viable later but unnecessary now | Settled (revisit if U3 fails) |
| D8 | **Cloudflare R2** for storage | S3; Supabase Storage; Cloudinary | Zero egress fees — decisive for read-heavy merchant photos; S3-compatible so migration is a config change | Settled |
| D9 | **Self-host QR generation** (`qrcode` OSS) | Uniqode/QR Tiger APIs | **[FACT]** QR SaaS is priced per-code ($5–99/mo, 3–500 codes) — economically impossible at 10k merchants, and puts our permanence-critical asset in a third party | Settled |
| D10 | **Self-hosted auth**, phone-OTP primary | Supabase Auth; Clerk; Auth0 | Identity is the hardest thing to migrate; per-MAU pricing punishes success; phone is the real identity in this market | Settled |
| D11 | **QR encodes `/m/{slug}`** (readable), with `/q/{token}` permanent alias | Opaque token only; slug only | Readability builds print trust + SEO + word-of-mouth; permanence guaranteed separately by never reusing slugs and 301-ing aliases forever | Settled |
| D12 | **Slugs never reused, never deleted** (trigger-enforced) | Free slugs on delete/rename | Reusing a slug would point a printed QR at a different business — the worst possible failure | **Invariant** |
| D13 | **"Regenerate QR" = restyle image only**; re-pointing is admin-only, off by default, typed confirmation | One ambiguous regenerate action | Removes the risk the brief flagged, by naming rather than by policy | Settled |
| D14 | **Offer status computed, never stored** | Cron flipping `is_active` | A failed cron leaves a merchant's page actively wrong; computed status cannot drift | Settled |
| D15 | **Merge products + services** into `catalog_items` | Separate tables | They differ by one boolean in practice; two tables = two UIs, two APIs, two AI builders, two sets of bugs | Settled |
| D16 | **No vector DB / no RAG** — structured context injection | pgvector + embeddings + chunking | A tenant's entire knowledge is 1.5–4k tokens. RAG adds cost, staleness, complexity **and a new cross-tenant leak class** in exchange for worse recall | Settled (revisit >15k tokens) |
| D17 | **AI provider abstraction mandatory** | Hard-code one provider | **[FACT]** all free tiers are rate-limited **org-wide**; no provider is a safe permanent foundation | Settled |
| D18 | **Deterministic answers + cache before any model call** | Model call per question | Gemini free = ~5 questions/merchant/day at 300 merchants. Caching is architecture, not optimisation | Settled |
| D19 | **First-party analytics, no cookies, daily-rotating hashes** | GA4; Plausible; PostHog | Third-party script on the critical path violates the perf constraint; DPDP-aligned; and the data is our retention product | Settled |
| D20 | **Free page forever; monetise the layers above** | Charge for the QR page | No evidence anyone monetises *presence alone* in this market; the page is the acquisition engine and the moat | **Hypothesis — gated on P0-2** |
| D21 | **Distribution elevated to a core deliverable** | Treat as post-launch marketing | Vyaparify/HDFC ships the same product with bank distribution; features cannot win this | Settled |
| D22 | **Merchant creation admin/verification-gated in V1** | Open self-serve signup | Shared-domain abuse could get the whole domain flagged by Safe Browsing → every printed QR breaks simultaneously. Moderation is a permanence issue | Settled |
| D23 | **System fonts, ≤30 KB JS, works without JS** on the public page | Webfonts; client-side rendering | The customer is on a low-end phone on a slow network; this is the product working or not | **Invariant** |
| D24 | **i18n architected in V1, translations in V2** | Hardcode English; full i18n now | Retrofitting i18n is expensive and we will not do it twice; translating before product-market fit is waste | Settled |
| D25 | **Dockerfile from day one** | Deploy-target-specific code | Every viable free host carries ToS/capacity risk; we must assume relocation | Settled |
| D26 | **Monthly merchant report is V1 scope** | Post-launch nice-to-have | Merchants churn from invisible value; the report *is* the retention mechanism | Settled |
| D27 | **Merchant `extra_instructions` treated as untrusted input** | Trust merchant config | A merchant could otherwise repurpose our rate-limited AI budget as a free public chatbot, or disable safety rules | Settled |
| D28 | **Separate `platform_admins` table**, not a role value | Role enum in memberships | Makes "can a merchant escalate to platform admin?" answerable by inspection | Settled |

---

## Open decisions (blocked on Phase 0)

| # | Question | Blocked by | Decide by |
|---|---|---|---|
| O1 | Launch AI provider | U2/U3 ToS checks (P0-4) | Start of Phase 5 |
| O2 | Hosting: Cloudflare vs VPS from day one | U3 (P0-4) | Start of Phase 1 |
| O3 | Final pricing tiers and amounts | U7 (P0-2) | End of Phase 0 |
| O4 | Is assisted onboarding V1 or V2? | U10 (P0-3) | Start of Phase 2 |
| O5 | Primary differentiation claim (permanence vs independence vs easy setup) | U9 (P0-2) | End of Phase 0 |
| O6 | Whether wholesale becomes the primary wedge (higher WTP hypothesis) | P0-2 | End of Phase 0 |
