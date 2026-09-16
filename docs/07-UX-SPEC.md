# 07 — UX / UI Specification

## 1. Design principles

1. **The customer is standing up.** On a phone, possibly in a queue, on a slow network, in bright
   sunlight. Design for that, not for a desk.
2. **The merchant is not a software user.** No jargon. No "entity", "publish workflow", "SKU
   attribute". Say "your shop page", "save", "what you sell".
3. **Nothing blocks the first screen.** No popups, no cookie banner (we set no cookies), no app
   prompt, no login wall.
4. **Every destructive action is recoverable or confirmed.** Soft delete + undo toast for content;
   typed confirmation for anything touching identity or the QR.
5. **Show, then save.** Preview is the default state of the merchant editor, not a separate mode.

---

## 2. Public merchant page

### Above the fold (the whole product's first impression)

```
┌─────────────────────────────┐
│  [cover image, 16:9]        │   ← AVIF, preloaded, LQIP blur, fixed aspect (no CLS)
│    ◯ logo                   │
├─────────────────────────────┤
│  Sharma Hair Salon          │   ← h1, 22–24px, system font
│  Barber & Salon · Kothapet  │
│  ● Open now · closes 9:00pm │   ← computed live, tenant timezone
├─────────────────────────────┤
│  🎉 Festival Offer          │   ← ONE hero offer, only if active now
│  Haircut ₹99 (was ₹150)     │
│  Valid till 20 Sep          │
├─────────────────────────────┤
│  [ Call ] [ WhatsApp ] [ ⇢ ]│   ← 48px min targets, plain <a> tags, work without JS
└─────────────────────────────┘
```

**Rules:** name + open-state + primary CTA visible without scrolling on a 360×640 screen. At most
**one** hero offer. Call/WhatsApp/Directions are `tel:`, `wa.me`, and a maps deep link —
**no JavaScript required, no API key, no cost.**

### Below the fold (order is per-vertical template)

Offers (remaining active) → Services/Menu with prices → Products → Photos → About → Hours (today
highlighted) → Location + directions → Social → Ask-a-question (AI) → Share / Save contact (vCard).

**Section rules:** collapsed to ~5 items with "show all" (progressive disclosure keeps the page
short and fast); prices right-aligned and scannable; empty sections **never render** (an empty
"Products" heading makes a shop look abandoned).

### Performance contract (enforced in CI)

≤30 KB gzipped JS · system font stack, no webfont · AVIF/WebP with explicit dimensions · lazy below
fold · no third-party scripts · LCP <2.0 s on throttled 3G · CLS <0.1 · **fully usable with
JavaScript disabled.**

### Accessibility

WCAG 2.1 AA: 4.5:1 text contrast (colour picker *rejects* merchant colour choices that fail — we
protect accessibility from the merchant's own taste), 44×44 px touch targets, semantic landmarks,
visible focus, alt text on every image (prompted at upload, auto-suggested), `prefers-reduced-motion`
respected, page language declared.

---

## 3. Merchant dashboard

**Mobile-first — the merchant will use a phone, not a laptop.** Desktop is the adaptation, not the
baseline.

**Navigation:** bottom tab bar on mobile — `Home · Content · QR · Insights · More`.

**Home:** "Your page is live" card with the URL + copy button + View button; this week's numbers in
plain words (*"38 people opened your page. 12 called you."*); 1–2 actionable nudges
(*"Add 3 photos — pages with photos get 2× more calls"* — **[HYPOTHESIS]**, must be replaced with
our own measured data before we state it as fact to merchants).

**Content editors:** single-column forms, one concept per screen, large inputs, autosave drafts,
explicit Publish. **Live preview accessible at all times.** Image upload straight from camera.
Drag-to-reorder with large handles.

**Offers editor:** presets first (*Today only · This weekend · This week · This month · Festival ·
Custom*) because dates are the hardest input for this user; status shown as a plain badge; expired
offers auto-move to an "Ended" section — never deleted, so they can be reused next festival.

**QR screen:** big QR preview · Download (PNG / SVG / **print-ready A5 standee PDF**) · style options
· **placement tips** (counter, door, table, bill, bag) · clear reassurance text: *"This code never
changes. Print it once — update your page any time."*

**Insights:** four plain-language answers (*Is my QR bringing customers? / Which offers get
attention? / When do people scan? / What do they do?*), big numbers, simple bars, comparison to last
period, no charts requiring interpretation.

### Empty / loading / error states (specified, not improvised)

- **Empty:** illustration + one sentence + one primary action. Never a blank table.
- **Loading:** skeletons matching final layout (no spinners, no layout shift).
- **Error:** what happened, in plain words + what to do + retry. Never a raw error code.
- **Offline:** dashboard detects offline, queues the save, tells the merchant it will save when
  connected. **[INTERPRETATION]** Non-negotiable for this market — connectivity drops mid-edit
  routinely, and losing a merchant's typed content once is enough to lose the merchant.
- **Success:** toast with undo where applicable.

---

## 4. Platform admin

Desktop-first (we use it at a desk). Dense tables, fast search, bulk actions. Merchant list with
status/activation filters. Merchant detail with every tab an admin needs plus the audit trail.

**Danger zone** — visually separated, red, requires typing the merchant name:
suspend · soft-delete · **change slug** · **re-point QR** (with the explicit warning: *"Every QR
already printed for this business will stop showing their page"*). Impersonation shows a persistent
banner and is time-boxed and logged.

---

## 5. Design system

**Tokens** (Tailwind theme + CSS variables):
- Type scale 12/14/16/18/22/28/36; body 16px minimum (never 14 on the public page).
- Spacing 4-point scale. Radius 8/12/16. Elevation: 3 levels, subtle.
- Colour: neutral greys + one brand accent + semantic success/warning/danger/info. **Merchant
  branding is limited to logo, cover and one accent colour** — constrained deliberately so every
  page stays fast, legible and trustworthy. Unlimited theming would let merchants build unusable
  pages and destroy the consistency that makes the platform feel credible.
- Dark mode: **dashboard yes, public page light-only in V1** (predictable print/screen match,
  fewer failure modes, no merchant-content contrast surprises).

**Components:** Button (4 variants × 3 sizes) · Input/Textarea/Select/Switch/DatePicker · Card ·
Sheet/Modal · Toast · Tabs · Badge · Avatar · ImageUploader · EmptyState · Skeleton ·
ConfirmDialog · PriceInput (paise-aware) · TimeRangePicker · SortableList.

Built on **shadcn/ui** — components live in our repo, so there is no upstream dependency risk and
full control over accessibility and size.

**Localisation readiness (V1):** all strings in a message catalogue from day one (no hardcoded
copy), Indian number formatting (₹1,23,456 lakh/crore grouping), `Intl` for dates, layouts tested
with ~30% longer strings since Indian-language translations run longer than English. Translations
ship in V2, but **retrofitting i18n is expensive and we will not do it twice.**

---

## 6. Onboarding flow (the highest-leverage screens)

Six steps, each one screen, progress shown, back always available, **everything except name/category
/phone skippable**:

`1 Name + category` → `2 Phone + WhatsApp` → `3 Location` → `4 Logo/cover (skippable)` →
`5 Add 3 items (guided, category-specific examples pre-filled as placeholders)` →
`6 Preview → Publish → QR`

**Anti-abandonment:** progress saved after every step; resume by SMS link; a merchant is never left
with a half-built public page (nothing is public until Publish); if they stop, the page stays
"coming soon" rather than looking broken.

**[HYPOTHESIS] to test in V0 (U10):** whether a typical target merchant completes this unaided. If
not, V2's assisted onboarding (speak/photograph your shop → we generate the page) moves up the
roadmap — and it is the clearest place an LLM creates real product value.
