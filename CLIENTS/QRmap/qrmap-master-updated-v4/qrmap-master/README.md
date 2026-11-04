# Merchant Digital Platform — Master Plan

Phase 0 deliverable: research, strategy and architecture for a multi-tenant permanent-QR digital
presence platform for offline businesses (India-first).

**Status:** planning complete · **no production code written yet** (deliberately — see
`docs/08-V1-IMPLEMENTATION-PLAN.md` Phase 0 gate).

## Read in this order

| Doc | Contents |
|---|---|
| [`00-EXECUTIVE-SUMMARY.md`](docs/00-EXECUTIVE-SUMMARY.md) | **Start here.** What we're building, the four places research says the original assumptions should change, positioning, business model, MVP, risks, success metrics |
| [`01-MARKET-RESEARCH.md`](docs/01-MARKET-RESEARCH.md) | Competitor teardown (GBP, Vyaparify/HDFC, DotPe, Uniqode, Popl, QR generators, Dukaan/Bikayi, link-in-bio), feature matrix, market gaps, differentiation, free-tier findings, **research debt** |
| [`02-PRODUCT-SPEC.md`](docs/02-PRODUCT-SPEC.md) | Problem, personas, customer/merchant/admin journeys, feature list, MVP vs non-MVP, roadmap, vertical templates, success metrics |
| [`03-ARCHITECTURE.md`](docs/03-ARCHITECTURE.md) | Stack decisions with trade-offs, modular monolith, multi-tenancy (4 isolation layers), **QR permanence design**, performance, analytics, scalability, backups, deployment |
| [`04-DATABASE.md`](docs/04-DATABASE.md) | Full schema, composite FKs, RLS policies, the `merchant_slugs` permanence table, migration rules |
| [`05-API-AND-SECURITY.md`](docs/05-API-AND-SECURITY.md) | Route map, authorization model, rate limits, threat-by-threat mitigations, privacy/DPDP, security checklist |
| [`06-AI-ARCHITECTURE.md`](docs/06-AI-ARCHITECTURE.md) | Why no vector DB, structured context injection, provider abstraction, cost control, prompt-injection guardrails |
| [`07-UX-SPEC.md`](docs/07-UX-SPEC.md) | Public page, merchant dashboard, admin, design system, onboarding flow, accessibility |
| [`08-V1-IMPLEMENTATION-PLAN.md`](docs/08-V1-IMPLEMENTATION-PLAN.md) | Phase-by-phase checklist with blocking gates, testing strategy |
| [`09-DECISION-LOG.md`](docs/09-DECISION-LOG.md) | 28 logged decisions + 6 open decisions blocked on Phase 0 |
| [`10-COST-MODEL.md`](docs/10-COST-MODEL.md) | ₹0 pilot → 100k merchants, what will eventually cost money and when, unit economics |

## The four core conclusions

1. **The product already exists with better distribution.** HDFC/Vyaparify "My Business QR" (Oct
   2025) is this vision, bank-distributed. The hard problem is distribution, not features.
2. **"₹0 infrastructure" is a trap if taken literally.** Vercel Hobby bans commercial use; Supabase
   free auto-pauses; Render free Postgres self-deletes. For a product whose core promise is that a
   printed QR resolves forever, those are liabilities, not savings. ₹0 pilot is achievable on
   Neon + Cloudflare R2; the domain is the one mandatory spend.
3. **Skip the vector database.** A merchant's entire knowledge is 1.5–4k tokens. Structured context
   injection is more accurate, cheaper, fresher, less code — and makes cross-tenant leakage
   structurally impossible rather than statistically unlikely.
4. **Don't charge for the page.** No evidence anyone monetises presence alone in this market. The
   page is free forever (acquisition + moat); revenue comes from countable leads, the website, and
   business software above it.

## Non-negotiable invariants

- A printed QR must resolve correctly, forever. Slugs are never reused or deleted.
- Merchant A can never reach Merchant B's data — enforced at 4 independent layers, tested in CI.
- The public page loads in under 2 s on a low-end Android over 3G, and works without JavaScript.

## Next action

**Phase 0 (`docs/08`)** — competitive teardown of Vyaparify, 10–15 merchant interviews, ToS
verification, register the domain. Roughly 40% of the strategic narrative is still hypothesis;
these tasks are cheap and close it before any code is written.
