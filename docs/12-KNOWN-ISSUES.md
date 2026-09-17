# 12 — Known Issues & Honest Gaps

Maintained as a living document, per the plan's own rule that a running Known
Issues list is part of the deliverable, not an afterthought.

## Confirmed against real infrastructure

Everything below was verified against a real PostgreSQL 16 instance (not mocked), a
real production Next.js build, and a running server — not just typechecked.

- 142/142 automated tests pass, including 57 tenant-isolation tests, 27
  adversarial AI-security tests and 16 public-page HTML/XSS-escaping tests,
  run against live Postgres with RLS enabled and forced.
- `npm run build` succeeds; the app boots with `next start` and serves real traffic.
- Manually verified end-to-end: public page renders real seeded data, QR PNG/SVG
  generate and decode-verify correctly, the `/q/{token}` permanent alias 308-redirects
  to the canonical slug, the vCard route produces a valid card and itself
  redirects on a renamed slug, the analytics beacon accepts events, the AI
  endpoint answers deterministically with zero model calls when a question
  matches a known pattern, and the OTP login flow creates a real database row
  and logs a real code via the console SMS driver.

## RESOLVED: public-page JS budget

**Original finding:** `03-ARCHITECTURE.md` §F sets a hard budget of ≤30 KB
gzipped JS on the public page. The first implementation, built as a React
Server Component page, shipped **~174 KB gzipped** despite having only two
small "use client" islands (`TrackView`, `AskAssistant`).

**Root cause, confirmed by inspecting the build manifest:** the cost was not
those two components. Next.js App Router attaches its client runtime (router,
prefetching, RSC streaming protocol) as `rootMainFiles` on the ROOT layout,
so it loads on every route in the app regardless of that route's own
client-component usage. Removing the two islands would not have removed this
— option 1 from the original note ("reimplement as an inline script") was
necessary but not sufficient on its own.

**Fix implemented:** the public page (`app/(public)/m/[slug]/route.ts`) is no
longer a React page. It is a plain Next.js Route Handler that returns a
hand-built HTML string (`modules/merchants/render-html.ts`) with inline CSS
and exactly one small inline `<script>` for the analytics beacon, delegated
CTA-click tracking and the ask-assistant widget. A Route Handler's response
is a raw `Response` — it never enters React's render/hydration pipeline, so
none of the framework's client bundle is attached. The dashboard and admin
console are unaffected and remain ordinary React, because they carry no such
budget (a merchant who has logged in has already chosen to be there).

**Measured result, on the real production build:**

| | Before | After |
|---|---|---|
| Framework JS chunks referenced | 8 | **0** |
| Gzipped JS | ~174 KB | **~1.7 KB** (the one inline script) |
| Total page weight (HTML+CSS+JS+JSON-LD), gzipped | n/a (not measured whole) | **~3.9 KB** |

This is roughly **8x under** the original 30 KB budget for JS alone, and the
*entire page* transfers in under 4 KB gzipped.

**What had to be handled by hand, now that React isn't escaping output:**
`modules/merchants/render-html.ts` runs every interpolated value (business
name, tagline, description, address, offer text, coupon codes) through an
explicit `esc()` HTML-escaper, and JSON-LD is escaped separately so a
`</script>` sequence in merchant-supplied text cannot break out of the block.
Covered by 16 tests in `modules/merchants/__tests__/render-html.spec.ts`,
including specific injection-attempt cases (`<script>`, `onerror=`, a
JSON-LD-breakout attempt). `redirect()`/`notFound()` from `next/navigation`
don't work inside a Route Handler the way they do in a page component, so the
alias-redirect and 404/410 cases are handled with plain `Response.redirect()`
and status codes instead — verified by actually renaming a merchant's slug
against the live database and confirming the old address 308-redirects to
the new one, for both the main page and the vCard route (the latter was
initially missed and has since been fixed and verified).

**Trade-off accepted:** ISR-style revalidation is now `Cache-Control:
public, s-maxage=60, stale-while-revalidate=300` instead of Next's
`revalidate` export, since Route Handlers don't get page-level ISR. This is
arguably more portable anyway (works at any CDN, not just Next-aware hosts),
consistent with the architecture's general bias against host lock-in.

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
