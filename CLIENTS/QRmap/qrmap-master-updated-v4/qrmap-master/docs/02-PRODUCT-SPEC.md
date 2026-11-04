# 02 — Product Specification

## 1. Problem statement

**The merchant's problem.** A small offline business has no dependable digital presence it controls.
Its options today are: a Google listing it does not own and cannot design; a WhatsApp status that
disappears in 24 hours; an Instagram page it has no time to maintain; or a ₹15,000 website it cannot
update. **[INTERPRETATION]** The result is that the information customers most want — *what do you
sell, what does it cost, are you open, what's the offer today* — lives only in the shopkeeper's head
and on a handwritten board.

**The customer's problem.** Standing in or outside a shop, a customer has no fast way to see the
full service list, current prices, today's offer, or how to get in touch later. They ask, or they
leave.

**The specific failure we remove:** the merchant *can* put information in the world, but every
channel available to them is either temporary (WhatsApp status, printed poster), not theirs
(Google, Zomato), or too expensive to change (printed menu, signboard). **What they need is
something permanent to point at, whose contents they can change for free, from their phone, in one
minute.**

That is the product: **a permanent address, with editable contents.**

---

## 2. Target customers

**Primary (V1 focus):** owner-operated businesses with a physical location, 1–15 staff, ₹2–50 lakh
annual revenue, in tier-1 through tier-3 Indian towns — barber shops, salons, cafés, restaurants,
clothing shops, grocery/kirana, bakeries, hardware, mobile/repair, tailors, gyms, tuition centres,
clinics.

**Secondary (validates the architecture, higher value):** wholesale/B2B traders and distributors
(catalog + MOQ + bulk tiers + "contact sales"); multi-branch small chains.

**Channel buyers (the distribution wedge — `01` §4.5):** market/trade associations, wholesale
complex managements, franchise groups, distributor networks — entities that onboard 50–500 merchants
in one decision.

**Explicitly NOT the target in V1:** large enterprises, pure online sellers (Dukaan/Shopify serve
them better), businesses with no physical premises.

### Personas

**Ramesh — barber, 34, tier-2 town.** Android phone, WhatsApp-fluent, types slowly in English,
prefers Telugu. Prices change for festivals. Has a Google listing someone else created; can't edit
it. *Wants:* customers to know his rates before asking, and to look modern next to the new salon.
*Will pay if:* he can see people are actually looking. *Will quit if:* it feels like homework.

**Fatima — clothing shop owner, 41.** Runs Instagram but inconsistently. New stock weekly. Sends
photos on WhatsApp to regulars. *Wants:* one link for her whole catalog that she can send and print.
*Will pay if:* it saves her re-sending photos. *Will quit if:* updating stock takes more than a minute.

**Suresh — wholesale hardware distributor, 52.** 800 SKUs, price-on-request, MOQ 50 units. Deals in
WhatsApp and phone calls. Has an outdated website from 2016. *Wants:* retailers to see the catalog
and MOQs without calling him. *Will pay considerably more than ₹149 if:* it reduces phone time.
**[HYPOTHESIS]** the wholesale segment has meaningfully higher willingness-to-pay — validate early.

**Priya — platform admin (us).** Needs to create merchants fast, fix mistakes safely, and never
accidentally break a printed QR.

---

## 3. Journeys

### 3.1 Customer journey (must take under 10 seconds to value)

```
Sees QR on counter/table/bag → scans with phone camera → page opens (<2s)
→ sees shop name, photo, OPEN/CLOSED, today's offer, big Call/WhatsApp/Directions buttons
→ scrolls: offers · services & prices · products · photos · hours · location · about
→ optionally asks the assistant a question
→ ACTS: calls / WhatsApps / navigates / saves contact / shares the link
```

**Design rules:** no account, no app, no login, no cookie banner, no popup, nothing blocking. The
first screen must answer *what is this, is it open, what's the deal, how do I contact you* without
scrolling. **[INTERPRETATION]** The customer is standing up, possibly in a queue, on a slow network.
Every element must earn its place against that reality.

### 3.2 Merchant journey (target: live QR in under 5 minutes)

```
Invited/created by admin or agent → OTP login on phone
→ Business name · category · phone · WhatsApp · location
→ Logo/cover photo (camera or gallery)
→ Add 3–5 catalog items (name + price)      ← guided, minimum viable content
→ Add one offer (optional, prompted)
→ PREVIEW exactly as a customer sees it
→ PUBLISH
→ QR appears: download PNG/SVG/print-ready standee PDF
→ Print & place
Later: edit anything from phone → page updates in seconds → SAME QR
```

**The moment that sells the product** is the preview → publish → QR-appears sequence. It must feel
instant and slightly magical. **[INTERPRETATION]** This is the single screen sequence most worth
polishing; it is where a merchant decides whether this is real.

### 3.3 Platform admin journey

Create merchant (name, category, phone, slug suggested + editable) → invite owner by SMS → monitor
activation → assist/complete setup where needed → manage plans, categories, flags, suspensions →
audited access throughout.

---

## 4. Feature list

### V1 — MVP (build this, nothing more)

**Platform admin:** merchant CRUD, slug allocation with collision/reserved checks, suspend/activate/
soft-delete, category management, plan management, feature flags, platform analytics, audit log,
time-boxed audited impersonation.

**Auth & roles:** phone-OTP login, email/password alternative, 4 roles (owner/manager/staff/platform),
session management, admin 2FA.

**Merchant dashboard (mobile-first):** business profile (name, tagline, description, logo, cover,
category), contact (phone/WhatsApp/email/website), address + map link, opening hours with split
shifts + holidays, social links, publish/unpublish with preview.

**Catalog:** unified services+products, price / price-range / price-on-request, unit, duration,
image, groups, availability, drag reorder, MOQ + bulk tiers (wholesale).

**Offers:** full CRUD, image, schedule (date range, daily window, weekdays), **computed status**
(draft/upcoming/active/expired), coupon code, terms, CTA, ordering.

**Media:** upload from camera/gallery, auto-process to AVIF/WebP ×3 sizes, reorder, delete, alt text.

**QR & public page:** permanent slug URL, slug history with forever-301, QR render (PNG/SVG/print
PDF) with style options, decode verification, public page (SSR, ≤30 KB JS), CTAs (call/WhatsApp/
directions/website/social/share/save-contact), open-closed state, SEO + LocalBusiness schema, OG
image, graceful suspended/deleted/coming-soon pages.

**Analytics:** privacy-first events, merchant dashboard (scans, uniques, CTA breakdown, offer
performance, hour×weekday heatmap, device), **and the monthly merchant report** (retention
mechanism — not optional).

**AI assistant:** deterministic answers + pre-computed FAQ + structured-context LLM, provider
abstraction, cache, quotas, guardrails, customer-question insights.

### V1 — explicitly NOT building

POS · payments/checkout · inventory management · booking/appointments · full e-commerce cart ·
loyalty/rewards · website builder · multi-branch UI · staff scheduling · CRM · review collection ·
vector search · native app · multi-language UI (architected, not translated) · custom domains ·
white-label · marketplace/discovery directory.

**[INTERPRETATION] The discipline here is the plan's main risk control.** The brief lists ~12 future
modules; the failure mode for a small team is building 30% of each. Every item above is *architected
for* (`04-DATABASE.md` has the nullable `group_id`, the `plans.limits` jsonb, the `outbox`) and
*deliberately not built*.

---

## 5. Roadmap

| Version | Theme | Contents | Gate to proceed |
|---|---|---|---|
| **V0** *(now)* | Validate | Competitive teardown (U1), 10–15 merchant interviews (U7–U10), ToS checks (U2/U3) | Positioning + price confirmed or revised |
| **V1** | Permanent presence | Everything in §4 above | 25 real merchants live, >70% activation, <2 s LCP |
| **V1.5** | Proof of value | Lead inbox (countable WhatsApp/call events), monthly report v2, GBP review link, share-to-WhatsApp card | First paying merchants; retention signal |
| **V2** | Reach & scale-out | Vernacular UI (Hindi/Telugu/Tamil first), **assisted/AI-generated onboarding**, merchant groups UI (associations/multi-branch), agent/reseller console | Aggregator deal signed |
| **V3** | Website | Same data → templated website, custom domain, richer SEO | Demand proven via Business-tier interest |
| **V4+** | Business software | Booking (salons/clinics first — highest fit), then billing/invoice, then inventory/CRM | Only where merchants ask and pay |

**[INTERPRETATION]** The ordering is deliberate: V1.5 exists because `00-EXECUTIVE-SUMMARY.md` §4
concludes merchants churn from *invisible* value, so proving value comes before adding features. The
website (V3) is delayed despite being the most requested future item, because it is a much larger
build and the presence layer must retain merchants first.

---

## 6. Vertical templates

One shared platform; presentation adapts by category (`categories.template_key`).

| Vertical | Emphasis | Key fields |
|---|---|---|
| Barber/Salon | Service menu with prices + durations | duration, "book by call/WhatsApp" |
| Restaurant/Café | Menu by section, veg/non-veg marks, photos | dietary flags, FSSAI |
| Retail/Clothing | Visual product grid, new arrivals | sizes/variants (V2), stock status |
| Grocery/Kirana | Simple list, delivery info, UPI | delivery radius, min order |
| Wholesale/B2B | Catalog with MOQ + bulk tiers, "contact sales" | GST, MOQ, price-on-request |
| Services/Medical | Services, credentials, hours, appointment CTA | AI restricted by default |

**Implementation:** templates are *configuration* (which sections show, their order, labels,
required fields) over the same schema — **not separate code paths**. Adding a vertical must be a
data change.

---

## 7. Success metrics

| Stage | Metric | Target |
|---|---|---|
| Onboarding | Published page with ≥3 catalog items within 24 h | >70% |
| Performance | Public-page LCP, throttled 3G / low-end Android | <2.0 s (release gate) |
| Engagement | Merchants with ≥1 CTA click per week | >60% |
| Value proof | Median CTA clicks per merchant per month | >20 |
| Monetisation | Free → paid conversion by month 3 | **[HYPOTHESIS]** 5–10% |
| Retention | Month-3 paying-merchant retention | >85% |
| Integrity | Cross-tenant isolation tests passing | 100%, always |
| Permanence | Public-page uptime | >99.9% |

---

## 8. Open product questions (must be answered by V0 research)

1. Will merchants pay ₹149/mo, and for *which* feature specifically? (U7)
2. Is the one-time setup service (₹999–2,499) the real early revenue line? (U7)
3. Does the permanence/independence claim resonate, or is it abstract until they're burned? (U9)
4. Can a typical target merchant complete self-serve onboarding unaided? (U10)
5. Is the wholesale segment's willingness-to-pay materially higher? (**strong hypothesis, untested**)
6. Is the lead inbox or the AI question-insight the stronger retention feature?
7. What share of target merchants are reachable outside a bank channel? (U8)
