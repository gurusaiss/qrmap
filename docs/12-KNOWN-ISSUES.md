# 12 — Known Issues & Honest Gaps

Maintained as a living document, per the plan's own rule that a running Known
Issues list is part of the deliverable, not an afterthought.

## Confirmed against real infrastructure

Everything below was verified against a real PostgreSQL 16 instance (not mocked), a
real production Next.js build, and a running server — not just typechecked.

- 126/126 automated tests pass, including 57 tenant-isolation tests and 27
  adversarial AI-security tests, run against live Postgres with RLS enabled and forced.
- `npm run build` succeeds; the app boots with `next start` and serves real traffic.
- Manually verified end-to-end: public page renders real seeded data, QR PNG/SVG
  generate and decode-verify correctly, the `/q/{token}` permanent alias 308-redirects
  to the canonical slug, the vCard route produces a valid card, the analytics
  beacon accepts events, the AI endpoint answers deterministically with zero
  model calls when a question matches a known pattern, and the OTP login flow
  creates a real database row and logs a real code via the console SMS driver.

## Open gap: public-page JS budget

**Finding:** `03-ARCHITECTURE.md` §F sets a hard budget of ≤30 KB gzipped JS on
the public page. Measured against the actual production build, the page ships
**~174 KB gzipped** of framework runtime (React + Next.js App Router client
runtime + RSC hydration plumbing), not the two small client components
(`TrackView`, `AskAssistant`) themselves.

**Why:** Next.js App Router ships a baseline client runtime even for a page
that is otherwise pure React Server Components, because the two "use client"
islands (analytics beacon, ask-assistant) pull in the hydration runtime for
the whole route. This is a known characteristic of the framework, not a bug
in this codebase — but it means the budget as originally written is not met
by the current implementation.

**Options, not yet decided:**
1. Remove the two client islands and reimplement them as a single inline
   `<script>` tag with vanilla DOM APIs (no React) — would likely bring the
   page close to the original budget, at the cost of losing JSX ergonomics
   for those two small pieces.
2. Revisit the Astro-vs-Next.js trade-off from `03-ARCHITECTURE.md` §C1,
   which flagged this exact tension as "the closest call in the document."
3. Relax the budget to a measured, honest number (e.g. ~180 KB gzipped,
   cached and shared across every route after the first page load) and rely
   on HTTP caching rather than a zero-JS ideal.

**Recommendation:** option 1 first (cheap, keeps the framework), because the
public page is the one place the budget is a release gate, not an aspiration.
Not yet implemented — flagged here rather than silently claimed as met.

## Architectural limitations, by design (not bugs)

- **Rate limiting is in-process** (`auth/rate-limit.ts`). Correct for a single
  instance; multiplies by instance count under horizontal scaling. Must move
  to a shared store (Postgres table or Redis) before running more than one
  app instance. Documented in the module's own header comment.
- **The `outbox` job table exists but no worker process consumes it yet.**
  Analytics rollup (`rollupDay`) and raw-event pruning (`pruneRawEvents`) are
  implemented as callable functions but are not yet wired to a cron/scheduler.
- **R2 storage driver is implemented but untested against a real R2 bucket**
  (no credentials in this environment). The local filesystem driver is fully
  exercised; the R2 SigV4 signing code has not been run against Cloudflare's
  actual endpoint.
- **SMS delivery only exercised via the console driver.** The MSG91 driver is
  implemented against their documented API but not tested against a live
  account.
- **AI providers (Gemini/Groq/Cloudflare Workers AI) are implemented but not
  exercised against live APIs** — no API keys in this environment. The `mock`
  and `none` providers are fully tested; the adversarial security suite runs
  against a spy provider that records what it was shown, which is what
  actually matters for the security property (verified: real requests never
  place another tenant's data in the prompt).
- **No email delivery module.** The monthly merchant report's data queries
  (`analytics/index.ts` → `monthlyReport`) are implemented and tested; the
  delivery channel (WhatsApp/SMS/email) described in the architecture is not
  yet built.
- **Platform admin UI has no automated tests.** The merchant-facing flows and
  the isolation/security layers have test coverage; the admin console
  (`src/app/admin/**`) was verified by manual click-through and typechecking
  only.
- **No CI pipeline file committed.** `08-V1-IMPLEMENTATION-PLAN.md` specifies
  a blocking CI gate (typecheck, lint, tests, isolation suite, Lighthouse
  budget); the checks all exist and pass locally but are not wired into a
  `.github/workflows` file in this environment.

## Explicitly out of scope for this pass (per the plan itself)

POS, payments, inventory, booking, full e-commerce, loyalty, website builder,
multi-branch UI, staff scheduling, CRM, review collection, vector search,
native app, translated UI (i18n is architected, not translated). See
`02-PRODUCT-SPEC.md` §4 for the reasoning.
