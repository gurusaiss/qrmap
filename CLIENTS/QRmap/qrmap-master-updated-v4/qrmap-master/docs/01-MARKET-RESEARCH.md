# 01 — Market Research & Competitor Analysis

Research pass: 2026-09-16. Labels: `[FACT]` sourced · `[INTERPRETATION]` synthesis · `[HYPOTHESIS]` unverified assumption.

> **Honesty note on research quality.** This is a *desk research* pass built from official pricing
> pages, product docs, review aggregators and recent industry coverage. It is sufficient to make
> architecture and positioning decisions. It is **not** sufficient to finalise pricing or
> positioning. Several high-value facts could not be verified and are listed in §9. Primary research
> (merchant interviews + hands-on competitor signup) is required before commitment.

---

## 1. Market map — the categories we sit between

Our product sits at the intersection of four established categories that do not currently overlap:

```
   QR INFRASTRUCTURE            DIRECTORY / DISCOVERY
   (Uniqode, QR Tiger,          (Google Business Profile,
    QR Code Monkey)              Justdial, local directories)
          \                            /
           \                          /
            \    >>> OUR SPACE <<<   /
            /   permanent merchant-  \
           /    owned profile + QR    \
          /                            \
   LINK-IN-BIO                   MERCHANT COMMERCE SUITES
   (Linktree, ownstreet,         (DotPe, Petpooja, Dukaan,
    SuperProfile, Popl)           Bikayi, UrbanPiper)
```

**[INTERPRETATION] The central finding of this research:** each neighbouring category solves a
*piece* of the merchant's problem and structurally refuses to solve the rest.

- QR infrastructure gives you an editable code but **nowhere to point it**.
- Directories give you a listing but it is **the platform's page, not the merchant's**.
- Link-in-bio gives you a page but is built for **creators and individuals, not shops with premises**.
- Commerce suites give you everything but are **heavy, sales-gated and priced for businesses that
  already have revenue to optimise**.

The gap is a *lightweight, permanent, merchant-owned presence layer* — cheap enough for a ₹40k/month
barber shop, simple enough for someone who has never used SaaS.

**[FACT] The gap is not unoccupied.** See §3 (Vyaparify/HDFC).

---

## 2. Competitor analysis

### 2.1 Google Business Profile — the default incumbent

| Dimension | Finding |
|---|---|
| Target customer | Any business with a physical location |
| Problem solved | Being findable on Google Search/Maps |
| Pricing | **[FACT]** Free |
| QR | **[FACT]** Supports a shareable link and a **review-request QR code**, generatable only from a desktop browser (not mobile), opening the review page. [Google Support](https://support.google.com/business/answer/16816815?hl=en) |
| Dynamic? | Effectively yes (link resolves to a live profile) |
| Dashboard | Yes — Google's own UI |
| Offers/catalog | Limited posts + a basic product module |
| Analytics | Yes — views, searches, direction requests, calls |
| AI | Some AI-assisted profile features |
| Website | **[FACT]** Google discontinued its free GBP website builder in 2024 |
| Strengths | Free, enormous distribution, drives Maps/Search, trusted |
| Weaknesses | **[INTERPRETATION]** Single-purpose QR (reviews, not storefront); the page is Google's, not the merchant's; no catalog CRUD depth; no WhatsApp-order flow; verification/moderation friction; merchant has zero control over layout or branding; suspension risk with no recourse |

**[INTERPRETATION] Strategic read: GBP is not a competitor to beat, it is a channel to complement.**
Every merchant should have a GBP *and* our page; our page should link to their GBP for reviews. Any
pitch that says "replace Google" will fail. The pitch is "Google shows you on a map — this is your
actual shop online, that you control, that you can print." **We should treat GBP as a feature we
integrate with, not an enemy.** *(Product implication: a "Reviews" CTA on the public page that deep-
links to the merchant's GBP review URL — near-zero effort, real merchant value.)*

### 2.2 Vyaparify / HDFC "My Business QR" — the direct competitor

| Dimension | Finding |
|---|---|
| Launched | **[FACT]** October 2025 |
| Target customer | **[FACT]** Indian SMEs/small merchants, via HDFC Bank's SmartHub Vyapar merchant base |
| Problem solved | **[FACT]** Positioned as giving small merchants "their first commerce identity" |
| Core offer | **[FACT]** Instantly generated permanent digital storefront at `h-id.vyaparify.com`; described as AI-powered, SEO-ready, WhatsApp-enabled |
| Customer flow | **[FACT]** Scan QR → discover merchant → view products/services → chat on WhatsApp → save contact to phonebook |
| Pricing | **UNVERIFIED** |
| Catalog depth / dashboard UX | **UNVERIFIED** |
| Languages | **UNVERIFIED** |
| Open to non-HDFC merchants? | **UNVERIFIED — [HYPOTHESIS] likely bank-gated** |

Sources: [Tribune India](https://www.tribuneindia.com/news/business/hdfc-bank-launches-countrys-first-my-business-qr-powered-by-vyaparify-giving-bharats-smes-their-first-commerce-identity/) ·
[Syllad](https://www.syllad.com/hdfc-bank-launches-my-business-qr-indias-first-instant-digital-storefront-for-small-merchants/)

**[INTERPRETATION]** This is functionally the product described in the master prompt, with a
distribution advantage that cannot be matched by product quality: HDFC's field agents are already
in the shop installing a payment QR standee. Onboarding friction approaches zero and CAC approaches
zero.

**Where a bank-gated product is structurally weak — our wedge:**
1. It can only serve *that bank's* merchants. **[HYPOTHESIS]** The majority of India's small
   merchants are not HDFC current-account holders.
2. Merchant lock-in to a bank relationship — switch banks, lose your page (and therefore every
   printed QR). **[HYPOTHESIS]** A genuine fear once experienced, but likely abstract to a merchant
   who has not yet been burned. **Must be tested in interviews before we build positioning on it.**
3. Bank-built software has a **[HYPOTHESIS]** predictable ceiling on UX iteration speed and is
   unlikely to serve niche verticals (wholesale MOQ pricing, salon service menus) deeply.
4. It is a *payments-first* company adding presence. We would be a *presence-first* company — the
   page is the point, not an attachment to a payment terminal.

> **Action P0-1 (blocking):** obtain hands-on access or a detailed demo. Document pricing, catalog
> CRUD depth, language support, eligibility, data export, and QR permanence semantics. This single
> task de-risks the whole venture more than any other.

### 2.3 DotPe (India)

**[FACT]** India-focused retail/restaurant commerce platform: POS, in-store QR ordering, online
ordering aggregation, catalog discovery, payments, loyalty. Modules cited: Catalogue Discovery,
In-store Ordering, Customer Engagement, Payment Experience; inventory with reorder points.
**[FACT]** Pricing is **not published** — sales-contact model, commission-based (~1–3% on orders,
negotiated), with a free basic tier.
Sources: [G2](https://www.g2.com/products/dotpe/reviews) · [SoftwareWorld](https://www.softwareworld.co/software/dotpe-reviews/) · [Restrofi](https://restrofi.com/blog/restaurant-pos-alternatives-india)

- **Strengths:** deep commerce stack, real transaction capability, established in food/retail.
- **Weaknesses / [INTERPRETATION]:** it is a POS suite with a QR menu inside it, not a presence
  product; heavy for a barber or a small clothing shop; **hidden pricing is a real barrier** for a
  low-literacy, low-trust merchant who wants to know the price before talking to a salesperson.
- **UNVERIFIED:** dynamic-vs-static QR mechanics, any AI features, website functionality, free-tier
  limits. Do not cite DotPe AI claims — none were found.

**[INTERPRETATION] Our read:** DotPe competes for the merchant's *transaction*, we compete for the
merchant's *identity*. Different budget line, different buyer psychology, and identity is upstream —
which is strategically the better place to start.

### 2.4 Uniqode (formerly Beaconstac) — QR infrastructure

**[FACT]** Rebranded 2023. 2026 pricing, **annual billing required on all paid plans**:
Starter **$5/mo** (3 dynamic codes, 25k scans, 30-day analytics) · Lite **$15/mo** (50 codes) ·
Pro **$49/mo** (250 codes, 90-day analytics, GPS, API) · Plus **$99/mo** (500 codes, 180-day
analytics) · Enterprise ~$200–500+/mo. Team seats ~$6/user/mo for detailed analytics.
Sources: [G2](https://www.g2.com/products/uniqode/pricing) · [QRForever](https://qrforever.com/blog/best-dynamic-qr-code-generator-2026) · [QRBench](https://www.qrbench.com/reviews/uniqode/)

- **Strengths:** excellent analytics depth, mature dynamic-QR management, API.
- **Weaknesses:** priced **per code and per scan** for marketing teams. **[INTERPRETATION]** For our
  use case — one permanent code per merchant across 10,000 merchants — this pricing model is
  economically impossible. This is precisely why we generate QR codes ourselves with an open-source
  library (see `03-ARCHITECTURE.md`): **buying QR-as-a-service would make our unit economics
  negative before we sold anything.**
- **Also:** annual-only billing and codes that die with the subscription are a poor fit for a
  merchant who has printed the code on physical assets.

### 2.5 Popl — digital business cards

**[FACT]** 2026 pricing: Free ($0, single user) · Pro **$7.99/mo** ($6.40 annual) · Pro+ (up to 5
cards, custom lead-capture, branded push) · Teams historically $5/user/mo but **[FACT]** team
pricing was removed from public listing as of August 2026 (sales-call only) · Enterprise event
lead-capture with "Popl AI" enrichment, custom-quoted.
Sources: [DigitalBusinessCard.com](https://www.digitalbusinesscard.com/blog/popl-pricing) · [OMR](https://omr.com/en/reviews/product/popl-digital-business-card-platform/pricing)

**[INTERPRETATION]** Target is individual professionals and sales teams at events — networking and
lead capture, not shops. Its QR is a vCard/link redirect. **Not a real competitor**, but it proves
the "one person, one permanent QR identity" pattern is a viable paid product at ~$8/mo in a Western
market. Relevance to us is the *pattern*, not the product.

### 2.6 Generic QR generators (QR Code Monkey, QR Tiger)

**[FACT]** QR Code Monkey: free **static** QR generator, customisable design, no scan limits or
expiry; **no native dynamic codes** (redirects users to a separate paid product for that).
**[FACT]** QR Tiger free plan: 3 dynamic codes, 500 scans each; exceeding limits **breaks the code**;
codes are tied to a continuing subscription.
Sources: [QRCodeNova](https://qrcodenova.com/en/blog/qr-tiger-vs-qr-code-monkey) · [Pageonaut](https://www.pageonaut.com/blog/best-free-qr-code-generators)

**[INTERPRETATION] This is the clearest whitespace in the entire research.** These tools produce a
QR *image* pointing at a URL the user supplies. They have no concept of merchant, catalog, offer or
profile. **A merchant who uses QR Code Monkey still has nowhere to point the code.** They are
complementary to, not competitive with, a merchant platform — and the fact that merchants use them
at all is evidence of unmet demand landing in the wrong tool.

It also surfaces a **real, concrete merchant pain we can weaponise in marketing**: free QR generators
produce codes that **break** when you stop paying or exceed a scan cap. A merchant who has printed
5,000 paper bags and then discovers the code is dead has suffered a real financial loss.
**"Your QR will never expire, never hit a scan limit, and never stop working if you downgrade"** is
a credible, verifiable, emotionally resonant promise that the QR-tool category cannot make.
*(This directly justifies the free-tier-forever policy in `00-EXECUTIVE-SUMMARY.md` §4.)*

### 2.7 Indian merchant platforms (adjacent)

| Product | Finding |
|---|---|
| **Dukaan** | **[FACT]** Bengaluru DIY e-commerce builder; from ~**₹499/mo**; no sales commission (payment-gateway fees only); claimed 2M+ stores by 2024. [Purshology](https://www.purshology.com/2026/02/shopify-vs-dukaan-vs-bikayi-2026-which-is-the-best-store-builder-for-india/) |
| **Bikayi** | **[FACT]** Budget store builder, WhatsApp-store integration, payment gateway. 2026 pricing **UNVERIFIED**. |
| **Petpooja** | **[FACT]** Restaurant POS; ~**₹1,500–₹12,000+/mo** by module (QR ordering, KDS, multi-branch) + GST/setup/hardware. [DineOpen](https://www.dineopen.com/blog/petpooja-pricing-plans-2026.html) |
| **UrbanPiper** | **[FACT]** Middleware (~₹2,000–3,000/mo) aggregating delivery orders into an existing POS. Not a storefront. |
| **ShopKirana** | **[FACT]** B2B procurement/supply for kiranas; **acquired by Udaan, July 2025**. Not customer-facing. [Tracxn](https://tracxn.com/d/companies/shopkirana/__z1yZW60IsOqDyLykV1r-nnMEcG_eJt18QblDG-BJ6bw) |
| **Vyapar** | Accounting/invoicing/GST app. Adjacent, not a storefront. **[INTERPRETATION]** Important as *proof that small Indian merchants will pay recurring software fees* when the value is concrete. |

**[INTERPRETATION]** The Indian small-merchant software market is real and monetising, but it
monetises **transactions (POS, orders) and compliance (GST, billing)** — not presence. Presence is
currently given away free by Google or bundled by a bank. **This is simultaneously the opportunity
(no one owns paid presence) and the risk (presence may not be a thing people pay for on its own).**
It is the strongest argument for the free-page / paid-layers-above model.

### 2.8 Link-in-bio (Linktree and Indian alternatives)

**[FACT]** Linktree charges **9% commission on sales**, bills in USD, **no native UPI** — cited as a
poor fit for Indian sellers. India-first alternatives: ownstreet (UPI checkout), GetSauce,
SuperProfile, Instamojo, Playto — creator/individual-seller oriented with booking links, review
buttons, QR sharing, loyalty. [ownstreet](https://ownstreet.in/blog/best-linktree-alternatives-india-2026)

**[INTERPRETATION]** Structurally the closest analogue to our public page (one page, one QR, many
actions) but aimed at creators and online sellers — no framing for physical premises, walk-in
customers, opening hours, in-shop offers or location. **[HYPOTHESIS]** None appear to offer
vernacular, low-literacy, assisted onboarding as a design principle — though a desk scan cannot
prove absence.

---

## 3. Feature comparison matrix

Legend: ● full · ◐ partial · ○ none/NA · ? unverified

| Capability | GBP | Vyaparify/HDFC | DotPe | Uniqode | QR Tiger | Dukaan | Linktree | **Us (V1)** |
|---|---|---|---|---|---|---|---|---|
| Permanent QR that never expires | ◐ | ● | ? | ◐ (dies w/ sub) | ○ | ○ | ◐ | **●** |
| Merchant-owned branded page | ○ | ● | ◐ | ○ | ○ | ● | ● | **●** |
| Works for shops *and* wholesalers | ◐ | ? | ◐ | ○ | ○ | ◐ | ○ | **●** |
| Catalog CRUD (services + products) | ◐ | ? | ● | ○ | ○ | ● | ◐ | **●** |
| Scheduled offers w/ auto-expiry | ◐ | ? | ◐ | ○ | ○ | ◐ | ○ | **●** |
| Per-merchant AI assistant | ◐ | ? | ○ | ○ | ○ | ○ | ○ | **●** |
| Privacy-first analytics | ● | ? | ● | ● | ◐ | ● | ● | **●** |
| Countable lead inbox | ◐ | ? | ● | ○ | ○ | ● | ◐ | **●** |
| Self-serve transparent pricing | ● | ? | **○** | ● | ● | ● | ● | **●** |
| Free forever tier | ● | ? | ◐ | ○ | ◐ | ○ | ● | **●** |
| Works without a bank relationship | ● | **○ (hyp.)** | ● | ● | ● | ● | ● | **●** |
| Vernacular/assisted onboarding | ◐ | ? | ○ | ○ | ○ | ○ | ○ | **◐ (V2)** |
| Multi-merchant group dashboard | ○ | ? | ◐ | ● | ◐ | ○ | ○ | **◐ (V2)** |

**[INTERPRETATION]** The honest reading of this table: our genuinely uncontested columns are
**self-serve transparent pricing + free forever + bank-independence + group onboarding**, and
*possibly* assisted onboarding. The feature columns (catalog, offers, analytics) are table stakes —
necessary to compete, insufficient to win. **We must not build our positioning on features.**

---

## 4. Market gaps (ranked by confidence)

1. **[INTERPRETATION — high confidence]** *Nowhere to point the QR.* Millions of merchants use free
   QR generators that produce codes with no destination and that break on downgrade/scan-cap. The
   destination is the product.
2. **[INTERPRETATION — high confidence]** *Pricing opacity.* DotPe and now Popl Teams hide pricing
   behind sales calls; Uniqode prices per-code for marketing teams. A merchant who just wants to
   know "how much?" is poorly served.
3. **[INTERPRETATION — medium]** *Provider/bank lock-in.* Presence tied to a payment provider or
   bank dies when the relationship does.
4. **[HYPOTHESIS — medium]** *Low-literacy onboarding.* Every competitor assumes a merchant who can
   type a form. **Test in interviews.**
5. **[HYPOTHESIS — medium]** *Aggregator onboarding.* No scanned product is built to onboard an
   entire market/association at once with a parent dashboard.
6. **[INTERPRETATION — medium]** *Wholesale/B2B presence.* Everything scanned is B2C-shaped. MOQ,
   bulk price tiers, "contact sales" flows, GST/trade details are unserved.
7. **[HYPOTHESIS — low, needs data]** *Attribution.* Merchants cannot tell whether digital presence
   produces customers. A countable lead inbox may be the highest-value feature in the whole product.

---

## 5. Differentiation — what we actually claim

Discarded as non-differentiating: "QR codes are useful", "one permanent identity" (Vyaparify says
the same), "we have AI" (everyone claims it), any feature list.

**Three defensible claims, in priority order:**

1. **Permanence as a contractual promise.** "Your QR will work forever — free tier included. It
   never expires, has no scan limit, and does not break if you stop paying." Competitors in the QR
   category *cannot* say this because their business model depends on the code dying. Backed by the
   technical architecture in §R, not just marketing.
2. **Independence.** "Your page, your data, your QR — works whoever you bank with. Export it any
   time." Directly attacks the bank-gated model's structural weakness.
3. **Setup that finishes.** "Five minutes, on your phone, in your language — or we'll come and do
   it for you." Addresses the real failure mode (merchants who start and abandon).

**[HYPOTHESIS]** All three are unvalidated with real merchants. Claim #1 is the most likely to be
*technically* true and *emotionally* weak (merchants may not imagine the failure until it happens).
Claim #3 is the most likely to actually close a sale. **Priority order may invert after interviews.**

---

## 6. Business model findings

**[INTERPRETATION]** Nothing in the research shows anyone successfully charging small Indian
merchants for *presence alone*. Money changes hands for transactions (DotPe ~1–3%), POS
(Petpooja ₹1.5k–12k/mo), storefronts with selling built in (Dukaan ₹499/mo), and compliance (Vyapar).

**[INTERPRETATION]** The viable model is therefore: **presence free (acquisition + moat) → charge
for the layer that produces countable business value.** Detailed tiers in
`00-EXECUTIVE-SUMMARY.md` §4. Dukaan's ~₹499/mo is a useful ceiling reference: our Growth tier must
sit clearly below it, which supports the ₹149 hypothesis, and Business at ₹399 must deliver a
website to justify approaching Dukaan's price.

**[HYPOTHESIS]** The one-time setup service (₹999–2,499) is likely the largest early revenue line
and simultaneously the distribution mechanism. **Highest-priority item to validate in interviews.**

---

## 7. Free-tier / infrastructure findings

Summarised here; decisions in `03-ARCHITECTURE.md`, costs in `10-COST-MODEL.md`.

**Hosting**
- **[FACT]** Vercel Hobby is free but **explicitly prohibits commercial use** (SaaS, e-commerce,
  client projects require Pro, $20/mo+). Limits: 100 GB bandwidth, 1M function invocations, 1M edge
  requests, 4 CPU-hours, 10 s timeout, 1,000 optimised images/mo. [DeployWise](https://deploywise.dev/blog/vercel-free-tier-limits-2026)
  → **Disqualified for V1 production use.**
- Cloudflare Pages/Workers free tier — **commercial-use ToS not verified in this pass (§9).**

**Database**
- **[FACT] Neon:** 0.5 GB/project, no card, no expiry, **commercial use allowed**. [getautonoma.com](https://getautonoma.com/blog/neon-database) → **Selected.**
- **[FACT] Supabase Free:** 500 MB DB, 1 GB storage, 50k MAU, 5 GB egress; **projects auto-pause
  after 7 days of inactivity**. [jetadmin.io](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)
  → **Rejected**: a paused DB means every printed QR in the field is dead. Unacceptable for this product.
- **[FACT] Render free Postgres:** deleted after 30 days. → **Rejected outright.**
- **[FACT] Railway:** ~$1 one-time credit, then billing. → Treat as paid.

**Object storage**
- **[FACT] Cloudflare R2:** 10 GB-month, 1M Class A (write) ops, 10M Class B (read) ops, **zero
  egress fees**. [freetier.co](https://freetier.co/directory/products/cloudflare-r2) → **Selected.**
  Zero egress matters enormously: merchant photos are read-heavy and served to every scanner.

**AI**

| Provider | Free-tier limits **[FACT]** | Commercial use |
|---|---|---|
| **Google Gemini** | 1,500 req/day, 15 RPM, 1M TPM on Flash/Flash-Lite. Pro tiers removed from free (paid-only since ~Apr 2026). [ai.google.dev](https://ai.google.dev/gemini-api/docs/rate-limits) | **CONFLICTING SOURCES — must verify directly against Google's ToS before depending on it.** Some sources say free tier excludes commercial use; others say it is permitted but inputs/outputs may train models. |
| **Groq** | 30 RPM, 6,000 TPM, 14,400 req/day **org-wide**; per-model caps (Llama-3.3-70B: 30 RPM / 1k RPD). [TokenMix](https://tokenmix.ai/blog/groq-free-tier-limits-2026) | Described as prototyping-only; paid Developer tier is pay-as-you-go with no subscription fee. |
| **Cloudflare Workers AI** | 10,000 Neurons/day free (shared pool, daily UTC reset), no card; then $0.011/1,000 Neurons. [pricepertoken.com](https://pricepertoken.com/endpoints/cloudflare/free) | Not flagged as commercially restricted in sources found. |

**[INTERPRETATION] Critical implication:** these limits are **org-wide, not per-tenant**. 1,500
Gemini requests/day across all merchants is ~5 questions/day at 300 merchants. Therefore
**caching + per-tenant rate limiting are not optimisations, they are architectural requirements**,
and the provider abstraction is mandatory rather than nice-to-have. See `06-AI-ARCHITECTURE.md`.

---

## 8. What merchants appear to value (and what is underserved)

**[INTERPRETATION]** from review aggregators and category positioning:
- Valued: transparent pricing, WhatsApp integration, speed of setup, not needing a computer,
  something that visibly produces customers, not paying commission on their own sales.
- Complained about across categories: hidden pricing/sales calls, codes that break, commission cuts
  (Linktree's 9%), complexity, hardware requirements, USD billing.

**Underserved, in our judgement:** transparent self-serve pricing for a single shop; permanence
guarantees; bank-independence; vernacular/assisted setup; group/association onboarding; wholesale
B2B presence shapes; honest attribution of whether any of it works.

---

## 9. Unverified items — research debt

Every one of these must be closed before pricing or positioning is committed. **Do not cite these
as facts in any investor or merchant material until verified.**

| # | Unknown | Why it matters | How to close |
|---|---|---|---|
| U1 | **Vyaparify/My Business QR**: pricing, catalog depth, dashboard UX, language support, whether non-HDFC merchants can sign up | Determines whether our wedge is real | Hands-on signup or demo — **P0-1, blocking** |
| U2 | **Gemini free-tier commercial-use ToS** — sources conflict | Could invalidate our zero-cost AI plan | Read Google's current ToS directly |
| U3 | **Cloudflare Pages/Workers free-tier commercial-use ToS** | Could invalidate the ₹0 hosting track | Read Cloudflare's ToS directly |
| U4 | **DotPe**: dynamic-vs-static QR, AI features, published pricing, free-tier limits | Competitive framing | Sales call / merchant users |
| U5 | **Bikayi** current 2026 pricing | Price anchoring | Official site |
| U6 | **Local web developer pricing in target towns** (the ₹10–25k figure is assumed) | Underpins the Business-tier pitch | Ask 5 merchants + 3 local devs |
| U7 | **Willingness to pay ₹149/₹399** and appetite for a ₹999–2,499 setup service | The entire business model | **Merchant interviews — P0-2, blocking** |
| U8 | **Share of target merchants without an HDFC relationship** | Sizes the wedge | Interviews + industry data |
| U9 | Whether merchants *care* about permanence/independence before being burned | Determines claim priority in §5 | Interviews |
| U10 | Actual literacy/typing barrier in tier-2/3 onboarding | Determines whether assisted onboarding is V1 or V2 | Watch 5 merchants attempt self-signup |

---

## 10. Research conclusions carried into the plan

1. The opportunity is real but **contested by a bank-backed incumbent** — distribution, not
   features, decides this. → Distribution elevated to a core deliverable.
2. **Presence alone is not monetisable** on current evidence → free page, paid value layers.
3. **Permanence is the one promise competitors structurally cannot make** → it becomes a hard
   architectural constraint, not a marketing line.
4. **Free tiers that pause, expire or forbid commercial use are disqualified** regardless of price.
5. **Org-wide AI rate limits** force caching, throttling and provider abstraction into the design.
6. **Table-stakes features must be built but must not be the pitch.**
7. **Roughly 40% of the strategic narrative is still hypothesis.** Ten items of research debt (§9)
   are open, two of them blocking. Close them before writing production code.
