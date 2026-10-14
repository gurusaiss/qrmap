/**
 * Hand-rolled HTML rendering for the public merchant page.
 *
 * Why this exists instead of a React Server Component: even a page with zero
 * "use client" components still ships the Next.js App Router's client runtime
 * (the router, prefetching, RSC streaming protocol) to every route, because
 * that bundle is attached at the ROOT layout, not per-page. Measured against
 * a real production build, that baseline was ~174 KB gzipped - nowhere near
 * the ≤30 KB budget in docs/03-ARCHITECTURE.md §F, and no amount of removing
 * client components from this one page brings it down, because the router
 * chunk loads regardless.
 *
 * The fix is to serve this one route as a plain Route Handler (see
 * `app/(public)/m/[slug]/route.ts`) that returns a hand-built HTML string with
 * no React and no Next.js client bundle at all. The dashboard and admin
 * console keep using React normally - they have no such budget, because a
 * merchant using them has already chosen to be there and is not standing in a
 * shop on a slow connection.
 *
 * Because there is no React here, there is no automatic escaping either.
 * EVERY interpolated value that can contain merchant- or customer-supplied
 * text goes through `esc()`. This is the one thing that must never be
 * skipped when extending this file.
 *
 * Visual design is deliberately photo-first and icon-rich rather than relying
 * on a loaded font or JavaScript-driven motion: everything here is a system
 * font and a CSS transition, which keeps the page instant on a slow
 * connection while still looking considered instead of templated. The one
 * animation budget spent is CSS-only micro-interactions (button press,
 * hover lift, image zoom) - nothing that requires JavaScript to render
 * correctly, so the page is just as complete with scripting disabled.
 */
import { createHash } from 'node:crypto';
import type { PublicPageData } from './public-page';
import { formatMoney, formatPriceRange } from '../core/money';
import { zonedParts } from '../core/time';

/**
 * Same selection rule as media/upload.ts's pickVariant, duplicated rather
 * than imported: that module pulls in sharp, a native dependency this
 * hand-rolled, zero-dependency page has no reason to carry.
 */
const GALLERY_VARIANT_WIDTHS = [400, 800, 1600] as const;
function pickGalleryVariant(variants: Record<string, string>, format: 'avif' | 'webp', width: number): string | null {
  const atLeast = GALLERY_VARIANT_WIDTHS.filter((w) => w >= width).sort((a, b) => a - b);
  const smaller = GALLERY_VARIANT_WIDTHS.filter((w) => w < width).sort((a, b) => b - a);
  for (const w of [...atLeast, ...smaller]) {
    const key = variants[`${format}_${w}`];
    if (key) return key;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Accent colour contrast - a merchant can pick any hex colour in Shop        */
/* details, with no restriction on how light or dark it is. Every CSS rule    */
/* below that used a bare `#ffffff`/`var(--accent)` for text ON TOP OF that   */
/* colour would go unreadable the moment a merchant chose something pale     */
/* (butter yellow, baby pink, near-white) - exactly the "colours clashing     */
/* with the fonts" a customer sees on a phone. These derive two safe colours  */
/* from whatever the merchant picked, instead of trusting it directly.       */
/* -------------------------------------------------------------------------- */
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex(c: { r: number; g: number; b: number }): string {
  const h = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

function relativeLuminance(c: { r: number; g: number; b: number }): number {
  const f = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = { r: 255, g: 255, b: 255 };
const NEAR_BLACK = { r: 26, g: 16, b: 8 };
const PAPER = { r: 253, g: 251, b: 246 };

/** Text printed directly on top of the accent colour (buttons, "Today" badge). */
function inkOn(accent: { r: number; g: number; b: number }): string {
  return contrastRatio(accent, NEAR_BLACK) > contrastRatio(accent, WHITE) ? toHex(NEAR_BLACK) : toHex(WHITE);
}

/**
 * The accent colour used AS TEXT on the pale page background (offer tag,
 * hover states). Darkens it, preserving its hue, until it is actually
 * readable rather than leaving it exactly as light as the merchant chose.
 */
function textAccentOn(accent: { r: number; g: number; b: number }, background: { r: number; g: number; b: number }): string {
  let c = accent;
  for (let i = 0; i < 16 && contrastRatio(c, background) < 4.5; i++) {
    c = { r: c.r * 0.88, g: c.g * 0.88, b: c.b * 0.88 };
  }
  return toHex(c);
}

export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Safe to embed inside a `<script type="application/json">` block. */
function escJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function attr(value: string): string {
  return esc(value);
}

function whatsappHref(number: string): string {
  return `https://wa.me/${number.replace(/[^\d]/g, '')}`;
}

function directionsHref(data: PublicPageData): string | null {
  if (data.profile.googleMapsUrl) return data.profile.googleMapsUrl;
  const address = [
    data.profile.addressLine1,
    data.profile.addressLine2,
    data.profile.city,
    data.profile.state,
    data.profile.pincode,
  ]
    .filter(Boolean)
    .join(', ');
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
}

function localBusinessJsonLd(data: PublicPageData, origin: string): string {
  return escJsonForScript({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: data.displayName,
    description: data.profile.description ?? data.profile.tagline ?? undefined,
    telephone: data.profile.phone ?? undefined,
    url: `${origin}/m/${data.slug}`,
    address: data.profile.addressLine1
      ? {
          '@type': 'PostalAddress',
          streetAddress: [data.profile.addressLine1, data.profile.addressLine2].filter(Boolean).join(', '),
          addressLocality: data.profile.city ?? undefined,
          addressRegion: data.profile.state ?? undefined,
          postalCode: data.profile.pincode ?? undefined,
          addressCountry: 'IN',
        }
      : undefined,
  });
}

/* -------------------------------------------------------------------------- */
/* Icons - small inline SVGs, trusted markup (never interpolates user data)   */
/* -------------------------------------------------------------------------- */

const ICON_PHONE = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6.2 3.5 8 7l-1.7 1.3a8.6 8.6 0 0 0 5.4 5.4L13 12l3.5 1.8c.3 1.4-.1 2.6-1.2 3.1-5.6.8-11-4.6-11.8-10.2.5-1.1 1.7-1.5 3.1-1.2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
const ICON_CHAT = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 10a7 7 0 1 1 3 5.7L3 17l1.2-3.3A6.96 6.96 0 0 1 3 10Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
const ICON_PIN = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 18s6-5.1 6-9.6A6 6 0 0 0 4 8.4C4 12.9 10 18 10 18Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="8.2" r="2" stroke="currentColor" stroke-width="1.5"/></svg>`;
const ICON_CLOCK = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v4l2.6 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const ICON_TAG = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m11 3 6 6-7 7-6-6V4h7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 7h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const ICON_IMAGE = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2.5" y="4" width="15" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="8.2" r="1.3" stroke="currentColor" stroke-width="1.4"/><path d="m4 15 4.3-4.3a1.5 1.5 0 0 1 2.1 0L13 13.3M14 11.6l.4-.4a1.5 1.5 0 0 1 2.1 0L18 12.6" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
const ICON_SPARKLE = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2.5 11.6 7.9 17 9.5l-5.4 1.6L10 16.5 8.4 11.1 3 9.5l5.4-1.6L10 2.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
const ICON_SEND = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M17 3 2.5 9.3c-.6.3-.5 1.1.1 1.3l5 1.6 1.6 5c.2.6 1 .7 1.3.1L17 3Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M17 3 8.6 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
const ICON_GLOBE = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M3 10h14M10 3c2 2.3 2 11.7 0 14M10 3c-2 2.3-2 11.7 0 14" stroke="currentColor" stroke-width="1.3"/></svg>`;
const ICON_STAR = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m10 3 2 4.2 4.6.6-3.3 3.2.8 4.6L10 13.3l-4.1 2.3.8-4.6-3.3-3.2 4.6-.6L10 3Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
const ICON_CARD = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2.5" y="4.5" width="15" height="11" rx="1.8" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 8h15M5.5 11.5h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

/**
 * The entire client-side behaviour of the public page in one inline script:
 * analytics beacon, delegated CTA click tracking, and the ask-assistant
 * widget. No framework, no build step, no hydration - this is the whole
 * JavaScript payload for the page besides this snippet's own bytes.
 *
 * This string is a CONSTANT — identical on every merchant's page. That is
 * deliberate: per-page data (tenant id, slug) is read at runtime from a
 * `data-*` attribute instead of being interpolated into the script text,
 * specifically so this script can be allow-listed in CSP by its SHA-256 hash
 * rather than needing `'unsafe-inline'`. See `INLINE_SCRIPT_CSP_HASH` below.
 */
export const INLINE_SCRIPT = `(function(){
"use strict";
var root=document.getElementById('mp-root');
var tenantId=root?root.getAttribute('data-tenant-id'):'';
var slug=root?root.getAttribute('data-slug'):'';
function send(eventType,extra){
  try{
    var body=JSON.stringify(Object.assign({tenantId:tenantId,eventType:eventType,referrer:document.referrer||null,qr:/[?&]qr=1(&|$)/.test(location.search)},extra||{}));
    if(navigator.sendBeacon){navigator.sendBeacon('/api/e',new Blob([body],{type:'application/json'}));}
    else{fetch('/api/e',{method:'POST',body:body,keepalive:true});}
  }catch(e){}
}
send('page_view');
document.addEventListener('click',function(e){
  var t=e.target && e.target.closest && e.target.closest('[data-track]');
  if(t){send(t.getAttribute('data-track'));}
},{passive:true});

var form=document.getElementById('ask-form');
if(form){
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var input=document.getElementById('ask-input');
    var answerBox=document.getElementById('ask-answer');
    var button=document.getElementById('ask-submit');
    var q=(input.value||'').trim();
    if(!q)return;
    button.disabled=true;button.textContent='Asking…';
    answerBox.hidden=true;
    fetch('/api/ai/'+encodeURIComponent(slug)+'/ask',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q})
    }).then(function(r){return r.json().then(function(j){return {ok:r.ok,json:j};});}).then(function(res){
      answerBox.textContent=res.json.answer||res.json.error||'Sorry, that did not work.';
      answerBox.hidden=false;
    }).catch(function(){
      answerBox.textContent='Could not reach the assistant. Please check your connection.';
      answerBox.hidden=false;
    }).finally(function(){
      button.disabled=false;button.textContent='Ask';
    });
  });
}
})();`;

/**
 * SHA-256 hash of the constant script above, in the `'sha256-...'` form CSP's
 * `script-src` expects. Computed once at module load. If `INLINE_SCRIPT` ever
 * changes, this changes with it automatically — there is nothing to keep in
 * sync by hand.
 */
export const INLINE_SCRIPT_CSP_HASH = `'sha256-${createHash('sha256').update(INLINE_SCRIPT).digest('base64')}'`;

/*
 * "Market Ledger" language (warm paper/ink, signage terracotta, a serif for
 * headings) - hand-written and self-contained, since this page never loads
 * globals.css or next/font and has its own hard byte budget. The serif is a
 * system stack (Georgia/ui-serif - zero network cost), and the richer feel
 * comes from layout, color and motion rather than a downloaded typeface:
 * a photo-led hero, a profile card that overlaps it, icon-led actions that
 * always fill their row (1, 2 or 3 of them, never leaving a dead cell), and
 * a tinted page background so wide screens never show a flat white gutter.
 */
const BASE_CSS = `
:root{--accent:#c2491d;--accent-ink:#ffffff;--accent-text:#c2491d;--ink-900:#241b15;--ink-800:#32271e;--ink-700:#4a3c32;--ink-500:#7a6b5d;--ink-400:#9c8d7e;--ink-300:#c2b4a4;--ink-200:#e4d9c9;--ink-100:#f0e8db;--ink-50:#fbf6ec;--success:#1f7a4d;--paper:#fdfbf6;--card:#fffdf9;--shadow-sm:0 1px 2px rgba(36,27,21,.07);--shadow-md:0 10px 28px -10px rgba(36,27,21,.22);--radius:18px;--radius-sm:11px}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:var(--ink-900);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased;background:radial-gradient(1100px 480px at 88% -8%,color-mix(in srgb,var(--accent) 11%,transparent),transparent 60%),radial-gradient(900px 420px at -8% 25%,color-mix(in srgb,var(--accent) 6%,transparent),transparent 55%),var(--paper)}
main{max-width:720px;margin:0 auto;padding-bottom:calc(7rem + env(safe-area-inset-bottom));position:relative;overflow-x:hidden}
.px{padding-left:1.1rem;padding-right:1.1rem}

.hero{position:relative;height:clamp(200px,42vw,320px);overflow:hidden;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 24%,var(--paper)),color-mix(in srgb,var(--accent) 5%,var(--paper)))}
.hero-img{position:absolute;inset:0;display:block;line-height:0}
.hero-img img{width:100%;height:100%;object-fit:cover;display:block}
.hero-monogram{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:ui-serif,Georgia,serif;font-size:clamp(72px,18vw,140px);font-weight:700;color:color-mix(in srgb,var(--accent) 38%,var(--paper));letter-spacing:-0.02em}
.hero-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,7,4,0) 30%,rgba(10,7,4,.58) 70%,rgba(10,7,4,.88) 100%)}
.hero-name{position:absolute;left:0;right:0;bottom:0;padding:1.15rem 1.1rem 2rem;color:#fff}
.hero-name h1{margin:0;font-family:ui-serif,Georgia,"Times New Roman",serif;font-size:clamp(22px,5.6vw,30px);font-weight:700;letter-spacing:-0.01em;line-height:1.18;text-wrap:balance;text-shadow:0 1px 10px rgba(0,0,0,.55),0 1px 3px rgba(0,0,0,.6)}

.profile-card{position:relative;margin:-24px .85rem 0;padding:1rem 1.15rem .3rem;background:var(--paper);border-radius:var(--radius) var(--radius) 0 0;box-shadow:0 -8px 20px -10px rgba(36,27,21,.18)}
.sub{margin:0;font-size:14.5px;font-weight:500;color:var(--ink-500)}
.open-row{display:flex;align-items:center;gap:.45rem;margin-top:.6rem;font-size:14.5px;font-weight:600}
.dot{display:inline-block;width:9px;height:9px;border-radius:999px;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 18%,transparent);flex:none}

.actions{position:sticky;top:0;z-index:10;display:flex;gap:.5rem;margin-top:.9rem;padding:.7rem max(1.1rem,env(safe-area-inset-left)) .7rem max(1.1rem,env(safe-area-inset-right));border-bottom:1px solid var(--ink-100);background:color-mix(in srgb,var(--paper) 94%,transparent);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.btn{flex:1;min-height:50px;display:flex;align-items:center;justify-content:center;gap:.4rem;border-radius:13px;font-size:13.5px;font-weight:700;text-decoration:none;transition:transform .15s ease,box-shadow .2s ease,background-color .15s ease,border-color .15s ease,color .15s ease;-webkit-tap-highlight-color:transparent}
.btn svg{width:17px;height:17px;flex:none}
.btn:active{transform:scale(.95)}
.btn-primary{background:var(--accent);color:var(--accent-ink);box-shadow:var(--shadow-sm)}
.btn-secondary{border:1.5px solid var(--ink-200);color:var(--ink-900);background:var(--card)}
@media(hover:hover){.btn-primary:hover{box-shadow:0 8px 18px -6px color-mix(in srgb,var(--accent) 65%,transparent);transform:translateY(-1px)}.btn-secondary:hover{border-color:var(--accent);color:var(--accent-text)}}

.offer{position:relative;margin:1.1rem 1.1rem 0;border-radius:var(--radius);overflow:hidden;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 11%,var(--card)),var(--card));border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);padding:1.1rem 1.15rem 1.15rem 1.35rem;box-shadow:var(--shadow-sm)}
.offer::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--accent)}
.offer-body{display:flex;justify-content:space-between;gap:.9rem;align-items:flex-start}
.offer-thumb{display:block;flex:none;width:72px;height:72px;border-radius:12px;overflow:hidden;background:var(--ink-100)}
.offer-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.offer-tag{display:inline-flex;align-items:center;gap:.35rem;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent-text)}
.offer-tag svg{width:13px;height:13px}
.offer h2{margin:.4rem 0 0;font-family:ui-serif,Georgia,serif;font-size:19px;font-weight:700;line-height:1.32;text-wrap:balance}
.coupon{margin-top:.65rem;display:inline-flex;align-items:center;border:1.5px dashed color-mix(in srgb,var(--accent) 55%,var(--ink-300));border-radius:8px;padding:4px 11px;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:14.5px;font-weight:600;letter-spacing:.02em}

section.card-section{margin-top:1.85rem;padding:0 1.1rem}
section.card-section>h2{display:flex;align-items:center;gap:.4rem;margin:0 0 .8rem;font-size:12.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-400)}
section.card-section>h2 svg{width:14px;height:14px;opacity:.8;flex:none}
.card{border:1px solid var(--ink-200);border-radius:var(--radius);background:var(--card);box-shadow:var(--shadow-sm);overflow:hidden}
.list li{list-style:none}

.catalog-list{margin:0;padding:0}
.catalog-group:not(:first-child){border-top:1px solid var(--ink-100)}
.catalog-group-heading{margin:0;padding:.75rem 1rem .4rem;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-400);background:var(--ink-50)}
.catalog-list li{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;padding:.9rem 1rem;border-bottom:1px solid var(--ink-100);transition:background-color .15s ease}
.catalog-list li:last-child{border-bottom:none}
@media(hover:hover){.catalog-list li:hover{background:var(--ink-50)}}
.row-main{display:flex;gap:.7rem;align-items:flex-start;min-width:0}
.min-w-0{min-width:0}
.catalog-thumb{display:block;flex:none;width:52px;height:52px;border-radius:11px;overflow:hidden;background:var(--ink-100)}
.catalog-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.catalog-name{font-weight:600;font-size:15.5px}
.catalog-desc{margin:.2rem 0 0;font-size:13.5px;color:var(--ink-500);line-height:1.5}
.catalog-meta{display:inline-block;margin-top:.3rem;font-size:11.5px;font-weight:600;letter-spacing:.01em;color:var(--ink-500);background:var(--ink-100);padding:2px 8px;border-radius:999px}
.price{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}

.offers-more{margin:0;padding:0}
.offers-more li{padding:.9rem 1rem;border-radius:var(--radius-sm);border:1px solid var(--ink-200);margin-bottom:.6rem;background:var(--card);transition:border-color .15s ease}
.offers-more li:last-child{margin-bottom:0}
@media(hover:hover){.offers-more li:hover{border-color:var(--accent)}}

.hours-row{display:flex;justify-content:space-between;align-items:center;padding:.6rem 0;border-bottom:1px solid var(--ink-100);font-size:14.5px}
.hours-row:last-child{border-bottom:none}
.hours-row.is-today{font-weight:700;color:var(--ink-900)}
.today-badge{display:inline-flex;margin-left:.45rem;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--accent-ink);background:var(--accent);padding:2px 7px;border-radius:999px;vertical-align:middle}
.hours-closed{color:var(--ink-400);font-weight:400}

address{font-style:normal;font-size:14.5px;line-height:1.65;color:var(--ink-700)}

.chips{display:flex;flex-wrap:wrap;gap:.55rem}
.chip-btn{display:inline-flex;align-items:center;gap:.4rem;padding:0 1rem;height:42px;border-radius:999px;border:1.5px solid var(--ink-200);background:var(--card);font-size:13.5px;font-weight:600;color:var(--ink-700);text-decoration:none;transition:border-color .15s ease,color .15s ease,transform .15s ease}
.chip-btn svg{width:15px;height:15px;flex:none}
.chip-btn:active{transform:scale(.96)}
@media(hover:hover){.chip-btn:hover{border-color:var(--accent);color:var(--accent-text)}}

.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.gallery picture{display:block;position:relative;aspect-ratio:1;overflow:hidden;border-radius:12px;background:var(--ink-100)}
.gallery img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .35s ease}
@media(hover:hover){.gallery picture:hover img{transform:scale(1.08)}}

.ask-box{border:1px solid var(--ink-200);border-radius:var(--radius);padding:.95rem;background:var(--card);box-shadow:var(--shadow-sm)}
.ask-row{display:flex;gap:.5rem}
.ask-box input{flex:1;min-width:0;min-height:48px;border:1.5px solid var(--ink-200);border-radius:var(--radius-sm);padding:0 .85rem;font-size:16px;background:var(--paper);transition:border-color .15s ease,box-shadow .15s ease}
.ask-box input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent)}
.ask-box button{flex:none;min-height:48px;display:inline-flex;align-items:center;gap:.35rem;padding:0 1.15rem;border:none;border-radius:var(--radius-sm);background:var(--ink-900);color:#fff;font-weight:700;font-size:14.5px;transition:transform .15s ease,background-color .15s ease}
.ask-box button svg{width:15px;height:15px}
.ask-box button:active{transform:scale(.96)}
@media(hover:hover){.ask-box button:hover{background:var(--accent);color:var(--accent-ink)}}
.ask-answer{margin-top:.8rem;border-radius:var(--radius-sm);background:var(--ink-50);padding:.85rem;font-size:14.5px;line-height:1.55}
.ask-hint{margin-top:.6rem;font-size:11.5px;color:var(--ink-400)}

footer{margin-top:3rem;padding:1.6rem 1.1rem 2.5rem;text-align:center;font-size:12.5px;color:var(--ink-400);border-top:1px solid var(--ink-100)}
footer a{color:inherit;text-decoration-color:var(--ink-200)}
footer .brand{display:inline-flex;align-items:center;gap:.4rem;margin-top:.65rem;font-weight:600;color:var(--ink-500)}
footer .brand svg{width:13px;height:13px}

@media(min-width:640px){.hero{border-radius:0 0 28px 28px}}
@media(prefers-reduced-motion:reduce){*{transition-duration:.001ms!important;animation:none!important}}

.status-page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 1.5rem;background:radial-gradient(900px 500px at 50% -10%,color-mix(in srgb,var(--accent) 10%,transparent),transparent 60%),var(--paper)}
.status-page h1{font-family:ui-serif,Georgia,serif;font-size:22px;font-weight:700}
.status-page p{margin-top:.75rem;font-size:15px;color:var(--ink-500);max-width:32rem}
`;

function pictureHtml(variants: Record<string, string>, width: number, altText: string, imgAttrs: string): string | null {
  const avif = pickGalleryVariant(variants, 'avif', width);
  const webp = pickGalleryVariant(variants, 'webp', width);
  const fallback = webp ?? avif;
  if (!fallback) return null;
  return `<picture>
    ${avif ? `<source srcset="/api/media/${attr(avif)}" type="image/avif">` : ''}
    ${webp ? `<source srcset="/api/media/${attr(webp)}" type="image/webp">` : ''}
    <img src="/api/media/${attr(fallback)}" alt="${attr(altText)}" ${imgAttrs}>
  </picture>`;
}

/** First gallery photo usable as the hero background; null if none exists or decodes. */
function heroPictureHtml(gallery: PublicPageData['gallery']): string | null {
  for (const g of gallery) {
    const picture = pictureHtml(g.variants, 1600, '', 'loading="eager" fetchpriority="high"');
    if (picture) return picture.replace('<picture>', '<picture class="hero-img">');
  }
  return null;
}

function galleryHtml(gallery: PublicPageData['gallery']): string {
  const figures = gallery
    .map((g) => pictureHtml(g.variants, 800, g.altText ?? '', 'loading="lazy"'))
    .filter((p): p is string => p !== null)
    .join('');
  return figures
    ? `<section class="card-section"><h2>${ICON_IMAGE}Photos</h2><div class="gallery">${figures}</div></section>`
    : '';
}

/** The offer's own "price" as one short, bold label - e.g. "20% off" / "₹100 off". */
function discountLabel(offer: {
  discountType: 'percent' | 'flat' | 'bogo' | 'custom';
  discountPercent: number | null;
  discountValueMinor: number | null;
}): string | null {
  if (offer.discountType === 'percent' && offer.discountPercent != null) return `${offer.discountPercent}% off`;
  if (offer.discountType === 'flat' && offer.discountValueMinor != null) {
    return `${formatMoney(offer.discountValueMinor)} off`;
  }
  if (offer.discountType === 'bogo') return 'Buy one, get one';
  return null;
}

function catalogItemLi(item: PublicPageData['services'][number], wholesale: boolean): string {
  const meta = [
    item.durationMinutes ? `${item.durationMinutes} min` : null,
    wholesale && item.minOrderQty ? `Min order ${item.minOrderQty}` : null,
    item.stockStatus && item.stockStatus !== 'in_stock' ? item.stockStatus.replace(/_/g, ' ') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const thumb = item.photo ? pictureHtml(item.photo, 160, '', 'loading="lazy"') : null;
  return `<li>
  <div class="row-main">
    ${thumb ? thumb.replace('<picture>', '<picture class="catalog-thumb">') : ''}
    <div class="min-w-0">
      <p class="catalog-name">${esc(item.name)}</p>
      ${item.description ? `<p class="catalog-desc">${esc(item.description)}</p>` : ''}
      ${meta ? `<span class="catalog-meta">${esc(meta)}</span>` : ''}
    </div>
  </div>
  <span class="price">${esc(formatPriceRange(item.priceMinor, item.priceMaxMinor, item.priceUnit))}</span>
</li>`;
}

/**
 * Groups items under their category name ("Breads", "Cakes") when a merchant
 * uses categories - items keep the order they were fetched in (their own
 * sort order), and the FIRST category name encountered decides where that
 * whole group renders, so there's no second query just to order categories.
 * When a merchant never used categories at all (the common case, and every
 * item that existed before this feature), every item's groupName is null and
 * this renders byte-identical to the old flat list.
 */
function catalogListHtml(items: PublicPageData['services'], wholesale: boolean): string {
  const buckets = new Map<string | null, PublicPageData['services']>();
  for (const item of items) {
    const bucket = buckets.get(item.groupName);
    if (bucket) bucket.push(item);
    else buckets.set(item.groupName, [item]);
  }

  const listFor = (list: PublicPageData['services']): string =>
    `<ul class="catalog-list">${list.map((item) => catalogItemLi(item, wholesale)).join('')}</ul>`;

  if (buckets.size <= 1) return listFor(items);

  return [...buckets.entries()]
    .map(([groupName, list]) =>
      groupName
        ? `<div class="catalog-group"><h3 class="catalog-group-heading">${esc(groupName)}</h3>${listFor(list)}</div>`
        : `<div class="catalog-group">${listFor(list)}</div>`,
    )
    .join('');
}

export function renderMerchantPageHtml(data: PublicPageData, origin: string, now: Date = new Date()): string {
  const accentRgb = (data.profile.accentColor ? parseHex(data.profile.accentColor) : null) ?? parseHex('#c2491d')!;
  const accent = toHex(accentRgb);
  const accentInk = inkOn(accentRgb);
  const accentText = textAccentOn(accentRgb, PAPER);
  const directions = directionsHref(data);
  const description = esc(
    data.profile.tagline ??
      data.profile.description?.slice(0, 155) ??
      `${data.displayName}${data.profile.city ? ` in ${data.profile.city}` : ''}. See services, prices, offers and contact details.`,
  );
  const pageUrl = `${origin}/m/${data.slug}`;
  const title = esc(`${data.displayName}${data.profile.city ? ` · ${data.profile.city}` : ''}`);
  const todayDow = zonedParts(now, data.timezone).weekday;

  const socials = Object.entries(data.profile.socials)
    .map(([name, url]) => `<a class="chip-btn" data-track="cta_social" rel="noopener" href="${attr(url)}">${ICON_GLOBE}${esc(name)}</a>`)
    .join('');

  const hero = heroPictureHtml(data.gallery);
  const monogram = esc((data.displayName.trim().charAt(0) || 'S').toUpperCase());

  const actionButtons = [
    data.profile.phone
      ? `<a class="btn btn-primary" data-track="cta_call" href="tel:${attr(data.profile.phone)}">${ICON_PHONE}<span>Call</span></a>`
      : null,
    data.profile.whatsapp
      ? `<a class="btn btn-secondary" data-track="cta_whatsapp" rel="noopener" href="${attr(whatsappHref(data.profile.whatsapp))}">${ICON_CHAT}<span>WhatsApp</span></a>`
      : null,
    directions
      ? `<a class="btn btn-secondary" data-track="cta_directions" rel="noopener" href="${attr(directions)}">${ICON_PIN}<span>Directions</span></a>`
      : null,
  ].filter((b): b is string => b !== null);

  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${attr(pageUrl)}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:url" content="${attr(pageUrl)}">
<meta name="robots" content="index, follow">
<style>${BASE_CSS}</style>
<script type="application/ld+json">${localBusinessJsonLd(data, origin)}</script>
</head>
<body>
<main id="mp-root" data-tenant-id="${attr(data.tenantId)}" data-slug="${attr(data.slug)}" style="--accent:${accent};--accent-ink:${accentInk};--accent-text:${accentText}">
  <div class="hero">
    ${hero ?? `<div class="hero-monogram" aria-hidden="true">${monogram}</div>`}
    <div class="hero-scrim" aria-hidden="true"></div>
    <div class="hero-name"><h1>${esc(data.displayName)}</h1></div>
  </div>

  <div class="profile-card px">
    <p class="sub">${esc([data.categoryName, data.profile.city].filter(Boolean).join(' · '))}</p>
    <p class="open-row">
      <span class="dot" style="background:${data.openState.open ? 'var(--success)' : 'var(--ink-400)'}" aria-hidden="true"></span>
      ${
        data.openState.open
          ? `<span style="color:var(--success)">Open now${data.openState.closingSoon ? ` · closes ${esc(data.openState.closesAt)}` : ` · until ${esc(data.openState.closesAt)}`}</span>`
          : `<span style="color:var(--ink-500)">Closed${
              !data.openState.open && data.openState.reason === 'holiday' && data.openState.holidayLabel
                ? ` · ${esc(data.openState.holidayLabel)}`
                : ''
            }${!data.openState.open && data.openState.opensNext ? ` · ${esc(data.openState.opensNext)}` : ''}</span>`
      }
    </p>
  </div>

  ${actionButtons.length ? `<nav class="actions" aria-label="Contact this business">${actionButtons.join('')}</nav>` : ''}

  ${
    data.heroOffer
      ? (() => {
          const thumb = data.heroOffer.photo ? pictureHtml(data.heroOffer.photo, 200, '', 'loading="lazy"') : null;
          const discount = discountLabel(data.heroOffer);
          return `<section class="offer">
    <div class="offer-body">
      <div class="min-w-0">
        <p class="offer-tag">${ICON_TAG}Current offer</p>
        <h2>${esc(data.heroOffer.title)}</h2>
        ${discount ? `<p style="margin:.35rem 0 0;font-size:20px;font-weight:700;color:var(--accent-text)">${esc(discount)}</p>` : ''}
        ${data.heroOffer.description ? `<p style="margin:.3rem 0 0;font-size:15px;color:var(--ink-700)">${esc(data.heroOffer.description)}</p>` : ''}
        <p style="margin-top:.55rem;font-size:13px;color:var(--ink-500)">${esc(data.heroOffer.validity)}</p>
        ${data.heroOffer.couponCode ? `<p class="coupon">${esc(data.heroOffer.couponCode)}</p>` : ''}
      </div>
      ${thumb ? thumb.replace('<picture>', '<picture class="offer-thumb">') : ''}
    </div>
  </section>`;
        })()
      : ''
  }

  ${galleryHtml(data.gallery)}

  ${
    data.offers.length > 0
      ? `<section class="card-section"><h2>${ICON_TAG}More offers</h2><ul class="list offers-more">${data.offers
          .map((o) => {
            const thumb = o.photo ? pictureHtml(o.photo, 160, '', 'loading="lazy"') : null;
            const discount = discountLabel(o);
            return `<li>
  <div class="row-main">
    ${thumb ? thumb.replace('<picture>', '<picture class="catalog-thumb">') : ''}
    <div class="min-w-0">
      <h3 style="margin:0;font-weight:600;font-size:15.5px">${esc(o.title)}</h3>
      ${discount ? `<p style="margin:.2rem 0 0;font-size:14.5px;font-weight:700;color:var(--accent-text)">${esc(discount)}</p>` : ''}
      ${o.description ? `<p style="margin:.25rem 0 0;font-size:14.5px;color:var(--ink-700)">${esc(o.description)}</p>` : ''}
      <p style="margin:.3rem 0 0;font-size:12.5px;color:var(--ink-500)">${esc(o.validity)}</p>
    </div>
  </div>
</li>`;
          })
          .join('')}</ul></section>`
      : ''
  }

  ${
    data.services.length > 0
      ? `<section class="card-section"><h2>${data.templateKey === 'menu' ? 'Menu' : 'Services'}</h2><div class="card">${catalogListHtml(data.services, false)}</div></section>`
      : ''
  }

  ${
    data.products.length > 0
      ? `<section class="card-section"><h2>Products</h2><div class="card">${catalogListHtml(data.products, data.templateKey === 'wholesale')}</div></section>`
      : ''
  }

  ${
    data.profile.description
      ? `<section class="card-section"><h2>About</h2><p style="font-size:15px;line-height:1.65;color:var(--ink-700)">${esc(data.profile.description)}</p></section>`
      : ''
  }

  <section class="card-section">
    <h2>${ICON_CLOCK}Opening hours</h2>
    <div class="card" style="padding:0 1rem">
      <ul class="list" style="margin:0;padding:0">
        ${data.week
          .map((day) => {
            const isToday = day.dayOfWeek === todayDow;
            const closed = day.windows.length === 0;
            return `<li class="hours-row${isToday ? ' is-today' : ''}"><span>${esc(day.day)}${isToday ? '<span class="today-badge">Today</span>' : ''}</span><span class="${closed ? 'hours-closed' : ''}">${closed ? 'Closed' : esc(day.windows.join(', '))}</span></li>`;
          })
          .join('')}
      </ul>
    </div>
  </section>

  ${
    data.profile.addressLine1 || data.profile.city
      ? `<section class="card-section">
    <h2>${ICON_PIN}Find us</h2>
    <div class="card" style="padding:1rem">
      <address>${esc(
        [data.profile.addressLine1, data.profile.addressLine2, data.profile.city, data.profile.state, data.profile.pincode]
          .filter(Boolean)
          .join(', '),
      )}</address>
      ${directions ? `<a class="btn btn-secondary" data-track="cta_directions" rel="noopener" href="${attr(directions)}" style="margin-top:.85rem;display:inline-flex;padding:0 1.1rem;flex:none">${ICON_PIN}Open in Maps</a>` : ''}
    </div>
  </section>`
      : ''
  }

  ${
    data.aiEnabled
      ? `<section class="card-section">
    <h2>${ICON_SPARKLE}Ask a question</h2>
    <form id="ask-form" class="ask-box">
      <label for="ask-input" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Ask ${esc(data.displayName)} a question</label>
      <div class="ask-row">
        <input id="ask-input" maxlength="300" placeholder="What time do you open?">
        <button id="ask-submit" type="submit">${ICON_SEND}Ask</button>
      </div>
      <p id="ask-answer" class="ask-answer" hidden role="status"></p>
      <p class="ask-hint">Answers come only from this shop's own information. Please call to confirm anything important.</p>
    </form>
  </section>`
      : ''
  }

  <section class="card-section">
    <h2>More</h2>
    <div class="chips">
      ${data.profile.websiteUrl ? `<a class="chip-btn" data-track="cta_website" rel="noopener" href="${attr(data.profile.websiteUrl)}">${ICON_GLOBE}Website</a>` : ''}
      ${data.profile.gbpReviewUrl ? `<a class="chip-btn" data-track="cta_social" rel="noopener" href="${attr(data.profile.gbpReviewUrl)}">${ICON_STAR}Leave a review</a>` : ''}
      ${socials}
      <a class="chip-btn" data-track="cta_save_contact" href="/m/${attr(data.slug)}/contact.vcf">${ICON_CARD}Save contact</a>
    </div>
  </section>

  <footer>
    <p>${esc(data.displayName)} · <span style="font-family:ui-monospace,monospace">/m/${esc(data.slug)}</span></p>
    <a class="brand" href="/">${ICON_SPARKLE}Get a page like this for your shop</a>
  </footer>
</main>
<script>${INLINE_SCRIPT}</script>
</body>
</html>`;
}

export function renderStatusPageHtml(kind: 'coming_soon' | 'suspended' | 'gone', displayName: string): string {
  const copy = {
    coming_soon: {
      title: `${displayName} is setting up`,
      body: 'This page is being prepared and will be live shortly. Please check back soon.',
    },
    suspended: {
      title: `${displayName} is temporarily unavailable`,
      body: 'This page is paused at the moment. Please contact the business directly.',
    },
    gone: {
      title: `${displayName} is no longer listed`,
      body: 'This business is no longer on the platform. The address you scanned is correct - the listing has been removed.',
    },
  }[kind];

  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(copy.title)}</title>
<meta name="robots" content="noindex, nofollow">
<style>${BASE_CSS}</style>
</head>
<body>
<div class="status-page">
  <h1>${esc(copy.title)}</h1>
  <p>${esc(copy.body)}</p>
</div>
</body>
</html>`;
}

export function renderNotFoundHtml(): string {
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Business not found</title>
<meta name="robots" content="noindex, nofollow">
<style>${BASE_CSS}</style>
</head>
<body>
<div class="status-page">
  <h1>We couldn't find that business</h1>
  <p>The address you scanned or typed does not match a business on this platform. Please check the code and try again.</p>
  <a href="/" class="btn btn-secondary" style="margin-top:1.5rem;padding:0 1.25rem;display:inline-flex;flex:none">Go to the home page</a>
</div>
</body>
</html>`;
}
