# 10 — Cost Model & Free-Tier Strategy

All figures **[FACT]** where a source is cited, otherwise **[HYPOTHESIS]** (our estimate).
USD→INR at ~₹88/$ for indicative conversion.

---

## 1. The honest position on "₹0"

You asked for as close to ₹0 as realistically possible. **Realistic answer: ₹0/month is achievable
for the pilot, but ₹0 *total* is not — the domain must be paid for, and it is the one thing that
must never lapse.**

More importantly: **the cheapest option is not always the cheapest option.** For this product,
`00-EXECUTIVE-SUMMARY.md` Challenge 2 establishes that several popular free tiers carry risks
(commercial-use prohibition, auto-pause, deletion) whose cost — a printed QR that stops working —
is far higher than the ₹400–1,600/month they save. Those are rejected regardless of price.

---

## 2. Phase costs

### Phase A — Pilot (0–50 merchants) · target ~₹75–125/month

| Item | Choice | Cost | Notes |
|---|---|---|---|
| Domain | Registrar, max term, auto-renew | **₹900–1,500/yr (~₹100/mo)** | **[FACT]** the only mandatory spend. Non-negotiable. |
| Hosting | Cloudflare Workers/Pages free | ₹0 | **[FACT]** free tier exists; **commercial ToS unverified (U3)** |
| Database | Neon free | ₹0 | **[FACT]** 0.5 GB, no expiry, **no auto-pause, commercial use allowed** |
| Object storage | Cloudflare R2 free | ₹0 | **[FACT]** 10 GB, 1M writes, 10M reads, **zero egress** |
| QR generation | `qrcode` OSS, self-hosted | ₹0 | Permanently free |
| Analytics | Self-hosted in Postgres | ₹0 | |
| AI | Gemini/Groq/Workers AI free tier | ₹0 | **[FACT]** org-wide limits; **Gemini commercial ToS unverified (U2)** |
| Email | Resend/Brevo free | ₹0 | |
| Monitoring | Sentry + UptimeRobot free | ₹0 | |
| SMS OTP | MSG91 | **~₹0.14/SMS** | **[HYPOTHESIS]** ~₹25/mo at 50 merchants with modest re-auth |
| **Total** | | **≈ ₹125/month** | |

### Phase B — Early revenue (50–500 merchants) · ~₹1,500–3,000/month

Neon paid or a single VPS (~₹400–900/mo) · R2 still within or near free · AI moves to pay-as-you-go
(Groq Developer / Gemini paid) · SMS ~₹150–400/mo · Sentry may need a paid tier.
**[HYPOTHESIS]** ~₹3–6 per merchant per month. At ₹149/mo with even 5% conversion this is
comfortably profitable on infrastructure — **the constraint is distribution cost, not infra.**

### Phase C — Scale (1k–10k merchants) · ~₹15,000–40,000/month

Managed Postgres with replica (₹8–20k) · app hosting (₹3–8k) · R2 beyond free (₹1–3k) ·
AI (₹2–10k, highly dependent on cache hit rate) · SMS (₹1–4k) · monitoring (₹2–4k).
**[HYPOTHESIS]** ~₹2–5 per merchant per month — unit economics improve with scale because the
dominant costs (caching, CDN, rollups) amortise.

### Phase D — 100k merchants

**[HYPOTHESIS]** ₹1.5–4 lakh/month, ~₹1.5–4 per merchant. Sharding/ClickHouse considered only if
measurement demands it. At this scale infrastructure is a rounding error against staffing.

---

## 3. What will eventually require payment — stated plainly, as the brief requires

| What | Why | Current free option | Limit | When we must pay | Est. cost then |
|---|---|---|---|---|---|
| **Domain** | Every printed QR depends on it | None | — | **Immediately** | ₹900–1,500/yr forever |
| **Database** | Data grows past free tier | Neon free | **[FACT]** 0.5 GB | ~1,000–2,000 merchants w/ analytics rollups | ₹1,000–2,000/mo |
| **Hosting** | Request volume / commercial ToS | CF Workers free | 100k req/day | ~500–1,000 merchants, or immediately if U3 fails | ₹800–2,500/mo |
| **Object storage** | Merchant photos | R2 free | **[FACT]** 10 GB | ~1,500 merchants @ ~6 MB each | ₹800–2,000/mo |
| **AI** | Org-wide free caps | Gemini/Groq/CF free | **[FACT]** 1,500 & 14,400 req/day org-wide | **~200–400 merchants** — the earliest hard wall | ₹2,000–10,000/mo |
| **SMS OTP** | Per-login cost | None | — | From merchant #1 | ~₹0.14/SMS |
| **Email** | Reports at volume | Resend/Brevo free | ~3k/mo or 300/day | ~2,000 merchants | ₹800–2,000/mo |
| **Monitoring** | Error volume | Sentry free | 5k events/mo | ~500 merchants | ₹1,700/mo |
| **Backups** | Independent of provider | R2 within free | 10 GB | ~2,000 merchants | folded into storage |

**The earliest binding constraint is AI** (~200–400 merchants), not hosting or database. This is
exactly why `06-AI-ARCHITECTURE.md` treats caching, deterministic short-circuits and pre-computed
FAQs as **architecture, not optimisation** — they push that wall out by roughly an order of
magnitude — and why AI sits behind the paid tier in the pricing model.

---

## 4. Unit economics (hypothesis — depends entirely on P0-2)

At 1,000 merchants with **[HYPOTHESIS]** 7% paid conversion at ₹149:
- Revenue ≈ ₹10,400/mo · Infra ≈ ₹3,000/mo · **Gross margin ≈ 70%**
- **The real cost is customer acquisition**, which is why `00` §8 makes distribution a first-class
  deliverable and why the one-time setup service matters — it can fund acquisition directly rather
  than requiring the subscription to pay it back over months.

**[INTERPRETATION]** At these price points, paid advertising almost certainly cannot work: a
₹149/mo merchant with even 24-month retention is worth ~₹3,500 gross, and Indian SMB digital CAC
typically exceeds what that supports once churn is priced in. Distribution must be human, viral, or
aggregated. **This is the single most important economic conclusion in the plan.**

---

## 5. Cost-control principles

1. **Cache before you scale.** Public pages hit ISR/CDN, not the database. AI hits the answer cache,
   not the model.
2. **Pre-process, don't re-process.** Images are transformed once at upload, not per request.
3. **Roll up, then drop.** Raw analytics live 90 days; rollups live forever and are tiny.
4. **Own the cheap things.** QR generation, analytics and image processing are all commodity
   problems where a vendor would charge per-merchant forever. We build them once.
5. **Rent the expensive things.** Postgres hosting and AI inference are genuinely hard; pay for them.
6. **Never let a free tier hold something we cannot move.** Identity, data and the domain stay
   portable by design.
