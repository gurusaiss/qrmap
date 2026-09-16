# 05 — API Design & Security Model

## Part 1 — API design

### Principles

1. **The tenant is never a request parameter.** It is derived server-side from the session
   (dashboard) or the URL slug (public). A `tenant_id` in a body/query is ignored and logged as a
   security event. This single rule eliminates the most common multi-tenant vulnerability class.
2. Dashboard mutations use **server actions**; anything a third party or the public page calls is a
   **route handler** under `/api`.
3. **Validate at the boundary with Zod**, then pass typed domain objects inward. No raw request data
   reaches a repository.
4. Every mutation returns the updated resource so the client never re-fetches to stay consistent.
5. Idempotency keys on anything that creates a durable artefact.

### Route map

**Public (no auth, aggressively cached)**

| Route | Purpose |
|---|---|
| `GET /m/{slug}` | The merchant page. SSR + ISR. Handles alias 301, suspended, deleted, unpublished. |
| `GET /q/{token}` | Permanent short alias → 301 to canonical `/m/{slug}` |
| `GET /api/qr/{slug}.{png\|svg}` | Public QR render, cached immutably |
| `POST /api/e` | Analytics beacon. No auth, strictly rate-limited, fire-and-forget |
| `POST /api/ai/{slug}/ask` | Chatbot. Tenant from slug **only**. Heavily rate-limited + cached |
| `GET /m/{slug}/opengraph-image` | Dynamic OG image for sharing |
| `GET /sitemap.xml`, `/robots.txt` | SEO |

**Merchant dashboard** (`/api/app/*` — session + membership required; tenant from session)

`GET|PATCH /profile` · `GET|PUT /hours` · `GET|POST /catalog`, `PATCH|DELETE /catalog/{id}`,
`POST /catalog/reorder` · `GET|POST /offers`, `PATCH|DELETE /offers/{id}` ·
`POST /media`, `DELETE /media/{id}`, `POST /media/reorder` ·
`GET /qr`, `POST /qr/download` · `GET /analytics/summary|timeseries|top` ·
`GET|PATCH /ai/config`, `GET /ai/questions` · `GET|POST /members`, `PATCH|DELETE /members/{id}` ·
`GET /plan`.

**Platform admin** (`/api/admin/*` — platform role + 2FA required; every call audited)

`GET|POST /tenants`, `GET|PATCH /tenants/{id}`, `POST /tenants/{id}/suspend|activate|delete` ·
`POST /tenants/{id}/slug` (rename; audited) ·
`POST /tenants/{id}/repoint-qr` (**destructive; typed confirmation; audited**) ·
`POST /tenants/{id}/impersonate` (**time-boxed, banner shown, fully audited**) ·
`GET|POST /categories` · `GET|POST /plans` · `GET|PATCH /flags` · `GET /analytics/platform` ·
`GET /audit`.

### Authorization — one function, used everywhere

```ts
// packages/auth — the ONLY way permission is decided
type Principal =
  | { kind: 'anon' }
  | { kind: 'merchant'; userId: string; tenantId: string; role: MerchantRole }
  | { kind: 'platform'; userId: string; role: PlatformRole };

function authorize(p: Principal, action: Action, resource: Resource): Result;
```

Every handler calls `authorize()` before touching data, **and** the `TenantScope` sets
`app.tenant_id` so RLS independently enforces the same boundary. Two mechanisms, deliberately
redundant: a bug in one is caught by the other.

### Rate limiting (all IP + principal keyed)

| Surface | Limit |
|---|---|
| OTP request | 3 / phone / 15 min; 10 / IP / hour — *protects the ₹0.14/SMS cost line as well as the account* |
| Login attempt | 10 / IP / 15 min, exponential backoff per account |
| Analytics beacon | 60 / visitor / min |
| **AI ask** | **5 / visitor / min, 20 / visitor / day, plus a per-tenant monthly plan cap** |
| Media upload | 20 / tenant / hour |
| Public page | CDN-level DDoS protection; no app-level limit (it must never be the thing that blocks a real customer) |

---

## Part 2 — Security model

### 2.1 The requirement that matters most

> Merchant A must not read, modify, or delete Merchant B's data under **any** API or UI
> manipulation.

**Defence in depth — four independent layers** (detail in `03-ARCHITECTURE.md` §D):
1. Composite FKs make cross-tenant references structurally impossible.
2. Postgres RLS `FORCE`d; app role has no `BYPASSRLS`; unset context → zero rows (fail-closed).
3. `TenantScope` chokepoint; direct `db` imports banned by lint outside two packages.
4. Server-side tenant resolution; client-supplied tenant IDs ignored and logged.

**Verification is mandatory and automated.** `isolation.spec.ts` enumerates every tenant-owned table
and every route, asserting A cannot reach B's rows through read, list, update, delete, media URL,
analytics query or AI question. **A new tenant-owned table without an isolation test fails CI.**

**[INTERPRETATION]** Most multi-tenant breaches are not clever attacks — they are a forgotten
`WHERE` clause in a feature written six months after launch. Layers 1 and 2 exist specifically
because layer 3 will eventually be bypassed by a tired developer, and the test gate exists because
layers 1 and 2 will eventually be forgotten on a new table.

### 2.2 Threat-by-threat

| Threat | Mitigation |
|---|---|
| **SQL injection** | Parameterised queries only (Drizzle); no string-built SQL; `CHECK`s and typed columns as backstop |
| **XSS** | React escaping by default; **no `dangerouslySetInnerHTML` anywhere** (lint-enforced); merchant rich text sanitised server-side with an allowlist; strict CSP |
| **CSRF** | `SameSite=Lax` cookies + origin check + CSRF token on cookie-authenticated mutations |
| **SSRF** | Merchant-supplied URLs are stored and rendered, **never fetched server-side**. If link previews are added later: allowlist schemes, block private/link-local IP ranges, no redirects followed |
| **File upload** | Magic-byte sniffing (not extension/MIME trust); re-encode every image through `sharp` (destroys polyglots/embedded payloads); strip EXIF; size + dimension caps; store on a **cookieless R2 domain** so a stored-XSS payload has no session to steal |
| **Brute force** | Rate limits above; account lockout with backoff; breached-password check; generic error messages (no account enumeration) |
| **Password security** | Argon2id; min length over complexity rules; no rotation policy; platform admins require TOTP 2FA |
| **Session** | Opaque server-side tokens; `HttpOnly`/`Secure`/`SameSite`; rotate on privilege change; revocable; 90-day expiry with idle timeout |
| **Privilege escalation** | `platform_admins` is a separate table with no merchant-reachable write path; role changes audited; **a tenant member can never grant a role above their own** |
| **Enumeration** | UUIDv7 PKs; slugs are public by design; no sequential IDs exposed |
| **Secrets** | Environment only; never in source; CI secret scanning; rotation runbook |
| **Headers** | HSTS (preload), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, frame-ancestors none |
| **CSP** | Strict on the public page: `default-src 'self'`, no inline scripts (nonce-based), images from R2/CDN only. Practical because the public page ships ≤30 KB of first-party JS |
| **CORS** | Public endpoints only, explicitly; dashboard/admin APIs same-origin only |
| **Dependencies** | Dependabot + `npm audit` blocking in CI; minimal dependency policy |

### 2.3 Privacy / DPDP (India)

- **No cookies and no PII collected from public-page visitors.** Only daily-rotating, non-
  correlatable hashes (`03` §G).
- Merchant PII (phone, email) is business contact data the merchant publishes deliberately; stored
  with purpose limitation, exportable and deletable.
- Data export ("download everything") and account deletion are **product features**, not support
  tickets — this also directly backs the "your data is yours" differentiation claim
  (`01-MARKET-RESEARCH.md` §5).
- Retention: raw analytics 90 days; rollups indefinitely (non-personal); audit logs 2 years.
- **[HYPOTHESIS]** DPDP obligations (consent notices, grievance officer, breach reporting) apply as
  our merchant count grows. **Legal review required before commercial launch** — flagged as an open
  item, not something this plan resolves.

### 2.4 Abuse of the platform itself

Because anyone can publish a public page, we can be used to host scams or illegal content.
- Merchant creation is **admin- or verification-gated in V1** (not open self-serve) — deliberate,
  and also good for quality.
- Content scanning for phishing/prohibited categories; a report button on every public page.
- Suspension is instant and serves the branded "unavailable" page.
- **[INTERPRETATION]** This is an underrated risk: a platform hosting merchant pages on a shared
  domain can get the *whole domain* flagged by Google Safe Browsing — which would break every
  printed QR simultaneously. That makes content moderation a **constraint-1 (permanence) issue**,
  not just a policy nicety. Mitigations: fast takedown, Safe Browsing monitoring on our own domain,
  and keeping merchant content on the main domain only (no user-controlled subdomains in V1).

### 2.5 Security checklist (living — maintained through development)

- [ ] RLS enabled + forced on every tenant table
- [ ] App DB role lacks `BYPASSRLS`
- [ ] Isolation test matrix covers 100% of tenant tables and routes
- [ ] No `dangerouslySetInnerHTML`; lint rule active
- [ ] All uploads re-encoded; EXIF stripped; served cookieless
- [ ] CSP strict, no unsafe-inline
- [ ] Admin 2FA enforced
- [ ] Impersonation audited + banner shown
- [ ] Rate limits on OTP, login, AI, uploads, beacon
- [ ] Secrets absent from repo; scanning in CI
- [ ] Audit log append-only; app role lacks UPDATE/DELETE
- [ ] Backups restore-tested
- [ ] Dependency scanning blocking
- [ ] AI guardrails tested against injection corpus (`06`)
