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
 */
import { createHash } from 'node:crypto';
import type { PublicPageData } from './public-page';
import { formatPriceRange } from '../core/money';

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
 * Same "Market Ledger" language as the dashboard (warm paper/ink, signage
 * terracotta, a serif for headings) but hand-written and self-contained:
 * this page has its own hard byte budget and never loads globals.css or
 * next/font, so the serif here is a system stack (Georgia/ui-serif - zero
 * network cost) rather than the dashboard's self-hosted Source Serif 4.
 */
const BASE_CSS = `
:root{--accent:#c2491d;--ink-900:#241b15;--ink-700:#4a3c32;--ink-500:#7a6b5d;--ink-400:#9c8d7e;--ink-200:#e4d9c9;--ink-100:#f0e8db;--ink-50:#fbf6ec;--success:#1f7a4d;--paper:#fdfbf6}
*{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:var(--ink-900);background:var(--paper);font-size:16px;line-height:1.5}
main{max-width:640px;margin:0 auto;padding-bottom:6rem}
.hero{height:10rem;width:100%;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 16%,var(--paper)),color-mix(in srgb,var(--accent) 4%,var(--paper)))}
.px{padding-left:1rem;padding-right:1rem}
h1{margin:1rem 0 0;font-family:ui-serif,Georgia,"Times New Roman",serif;font-size:23px;font-weight:700;letter-spacing:-0.01em;line-height:1.2}
.sub{margin:0.25rem 0 0;font-size:15px;color:var(--ink-500)}
.open-row{display:flex;align-items:center;gap:0.5rem;margin:0.75rem 0 0;font-size:15px;font-weight:500}
.dot{display:inline-block;width:10px;height:10px;border-radius:999px;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 18%,transparent)}
.offer{margin:1rem;border-radius:14px;border:1px solid color-mix(in srgb,var(--accent) 28%,transparent);background:color-mix(in srgb,var(--accent) 6%,var(--paper));padding:1rem}
.offer-tag{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;color:var(--accent)}
.offer h2{margin:0.25rem 0 0;font-family:ui-serif,Georgia,serif;font-size:18px;font-weight:700}
.actions{position:sticky;top:0;z-index:10;display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;margin-top:1rem;padding:0.75rem 1rem;border-bottom:1px solid var(--ink-100);background:color-mix(in srgb,var(--paper) 95%,transparent);backdrop-filter:blur(4px)}
.btn{min-height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;font-size:13px;font-weight:600;text-decoration:none;transition:transform .15s ease,box-shadow .15s ease,background-color .15s ease;-webkit-tap-highlight-color:transparent}
.btn:active{transform:scale(0.96)}
.btn-primary{background:var(--accent);color:#fff;box-shadow:0 1px 2px rgba(36,27,21,.18)}
.btn-secondary{border:1px solid var(--ink-200);color:var(--ink-900);background:var(--paper)}
@media(hover:hover){.btn-primary:hover{background:color-mix(in srgb,var(--accent) 88%,black)}.btn-secondary:hover{border-color:var(--ink-400)}}
section.card-section{margin-top:1.5rem;padding:0 1rem}
section.card-section h2{margin:0 0 0.75rem;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;color:var(--ink-400)}
.card{border:1px solid var(--ink-200);border-radius:14px;background:#fffdf9}
.list li{list-style:none}
.catalog-list{margin:0;padding:0}
.catalog-list li{display:flex;justify-content:space-between;gap:1rem;padding:0.75rem;border-bottom:1px solid var(--ink-100);transition:background-color .15s ease}
.catalog-list li:last-child{border-bottom:none}
@media(hover:hover){.catalog-list li:hover{background:var(--ink-50)}}
.catalog-name{font-weight:500}
.catalog-desc{margin:0.15rem 0 0;font-size:14px;color:var(--ink-500)}
.catalog-meta{margin:0.15rem 0 0;font-size:13px;color:var(--ink-400)}
.price{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.offers-more li{padding:0.75rem;border-radius:14px;border:1px solid var(--ink-200);margin-bottom:0.75rem;background:#fffdf9}
.hours-row{display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--ink-100);font-size:15px}
.hours-row:last-child{border-bottom:none}
.hours-today{color:var(--ink-700)}
.hours-closed{color:var(--ink-400)}
address{font-style:normal;font-size:15px;line-height:1.6;color:var(--ink-700)}
.chips{display:flex;flex-wrap:wrap;gap:0.5rem}
.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;background:var(--ink-100)}
.ask-box{border:1px solid var(--ink-200);border-radius:14px;padding:0.75rem;background:#fffdf9}
.ask-box input{width:100%;min-height:48px;border:1px solid var(--ink-200);border-radius:10px;padding:0 0.75rem;font-size:16px;background:var(--paper);transition:border-color .15s ease}
.ask-box input:focus{outline:none;border-color:var(--accent)}
.ask-box button{width:100%;min-height:48px;margin-top:0.5rem;border:none;border-radius:10px;background:var(--ink-900);color:#fff;font-weight:600;font-size:15px;transition:transform .15s ease}
.ask-box button:active{transform:scale(0.98)}
.ask-answer{margin-top:0.75rem;border-radius:10px;background:var(--ink-50);padding:0.75rem;font-size:15px;line-height:1.5}
.ask-hint{margin-top:0.5rem;font-size:12px;color:var(--ink-400)}
footer{margin-top:2.5rem;padding:0 1rem 2rem;text-align:center;font-size:13px;color:var(--ink-400)}
footer a{color:inherit;text-decoration-color:var(--ink-200)}
.status-page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 1.5rem}
.status-page h1{font-family:ui-serif,Georgia,serif;font-size:21px;font-weight:700}
.status-page p{margin-top:0.75rem;font-size:15px;color:var(--ink-500);max-width:32rem}
`;

function galleryHtml(gallery: PublicPageData['gallery']): string {
  const figures = gallery
    .map((g) => {
      const avif = pickGalleryVariant(g.variants, 'avif', 800);
      const webp = pickGalleryVariant(g.variants, 'webp', 800);
      const fallback = webp ?? avif;
      if (!fallback) return '';
      return `<picture>
    ${avif ? `<source srcset="/api/media/${attr(avif)}" type="image/avif">` : ''}
    ${webp ? `<source srcset="/api/media/${attr(webp)}" type="image/webp">` : ''}
    <img src="/api/media/${attr(fallback)}" alt="${attr(g.altText ?? '')}" loading="lazy">
  </picture>`;
    })
    .filter(Boolean)
    .join('');
  return figures ? `<section class="card-section"><h2>Photos</h2><div class="gallery">${figures}</div></section>` : '';
}

function catalogListHtml(items: PublicPageData['services'], wholesale: boolean): string {
  return `<ul class="catalog-list">${items
    .map((item) => {
      const meta = [
        item.durationMinutes ? `${item.durationMinutes} min` : null,
        wholesale && item.minOrderQty ? `Min order ${item.minOrderQty}` : null,
        item.stockStatus && item.stockStatus !== 'in_stock' ? item.stockStatus.replace(/_/g, ' ') : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return `<li>
  <div>
    <p class="catalog-name">${esc(item.name)}</p>
    ${item.description ? `<p class="catalog-desc">${esc(item.description)}</p>` : ''}
    ${meta ? `<p class="catalog-meta">${esc(meta)}</p>` : ''}
  </div>
  <span class="price">${esc(formatPriceRange(item.priceMinor, item.priceMaxMinor, item.priceUnit))}</span>
</li>`;
    })
    .join('')}</ul>`;
}

export function renderMerchantPageHtml(data: PublicPageData, origin: string): string {
  const accent = data.profile.accentColor && /^#[0-9a-fA-F]{6}$/.test(data.profile.accentColor) ? data.profile.accentColor : '#c2491d';
  const directions = directionsHref(data);
  const description = esc(
    data.profile.tagline ??
      data.profile.description?.slice(0, 155) ??
      `${data.displayName}${data.profile.city ? ` in ${data.profile.city}` : ''}. See services, prices, offers and contact details.`,
  );
  const pageUrl = `${origin}/m/${data.slug}`;
  const title = esc(`${data.displayName}${data.profile.city ? ` · ${data.profile.city}` : ''}`);

  const socials = Object.entries(data.profile.socials)
    .map(([name, url]) => `<a class="btn btn-secondary" data-track="cta_social" rel="noopener" href="${attr(url)}">${esc(name)}</a>`)
    .join('');

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
<main id="mp-root" data-tenant-id="${attr(data.tenantId)}" data-slug="${attr(data.slug)}" style="--accent:${accent}">
  <header>
    <div class="hero" aria-hidden="true"></div>
    <div class="px">
      <h1>${esc(data.displayName)}</h1>
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
  </header>

  ${
    data.heroOffer
      ? `<section class="offer">
    <p class="offer-tag">Current offer</p>
    <h2>${esc(data.heroOffer.title)}</h2>
    ${data.heroOffer.description ? `<p style="margin:0.25rem 0 0;font-size:15px;color:var(--ink-700)">${esc(data.heroOffer.description)}</p>` : ''}
    <p style="margin-top:0.5rem;font-size:13px;color:var(--ink-500)">${esc(data.heroOffer.validity)}</p>
    ${data.heroOffer.couponCode ? `<p style="margin-top:0.5rem;display:inline-block;border:1px dashed var(--ink-400);border-radius:6px;padding:2px 8px;font-family:monospace;font-size:15px">${esc(data.heroOffer.couponCode)}</p>` : ''}
  </section>`
      : ''
  }

  <nav class="actions" aria-label="Contact this business">
    ${data.profile.phone ? `<a class="btn btn-primary" data-track="cta_call" href="tel:${attr(data.profile.phone)}">Call</a>` : ''}
    ${data.profile.whatsapp ? `<a class="btn btn-secondary" data-track="cta_whatsapp" rel="noopener" href="${attr(whatsappHref(data.profile.whatsapp))}">WhatsApp</a>` : ''}
    ${directions ? `<a class="btn btn-secondary" data-track="cta_directions" rel="noopener" href="${attr(directions)}">Directions</a>` : ''}
  </nav>

  ${galleryHtml(data.gallery)}

  ${
    data.offers.length > 0
      ? `<section class="card-section"><h2>More offers</h2><ul class="list offers-more">${data.offers
          .map(
            (o) =>
              `<li>
    <h3 style="margin:0;font-weight:600">${esc(o.title)}</h3>
    ${o.description ? `<p style="margin:0.25rem 0 0;font-size:15px;color:var(--ink-700)">${esc(o.description)}</p>` : ''}
    <p style="margin:0.25rem 0 0;font-size:13px;color:var(--ink-500)">${esc(o.validity)}</p>
  </li>`,
          )
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
      ? `<section class="card-section"><h2>About</h2><p style="font-size:15px;line-height:1.6;color:var(--ink-700)">${esc(data.profile.description)}</p></section>`
      : ''
  }

  <section class="card-section">
    <h2>Opening hours</h2>
    <ul class="list" style="margin:0;padding:0">
      ${data.week
        .map(
          (day) =>
            `<li class="hours-row"><span>${esc(day.day)}</span><span class="${day.windows.length ? '' : 'hours-closed'}" style="font-weight:${day.windows.length ? 500 : 400}">${day.windows.length ? esc(day.windows.join(', ')) : 'Closed'}</span></li>`,
        )
        .join('')}
    </ul>
  </section>

  ${
    data.profile.addressLine1 || data.profile.city
      ? `<section class="card-section">
    <h2>Find us</h2>
    <address>${esc(
      [data.profile.addressLine1, data.profile.addressLine2, data.profile.city, data.profile.state, data.profile.pincode]
        .filter(Boolean)
        .join(', '),
    )}</address>
    ${directions ? `<a class="btn btn-secondary" data-track="cta_directions" rel="noopener" href="${attr(directions)}" style="margin-top:0.75rem;display:inline-flex;padding:0 1rem">Open in Maps</a>` : ''}
  </section>`
      : ''
  }

  ${
    data.aiEnabled
      ? `<section class="card-section">
    <h2>Ask a question</h2>
    <form id="ask-form" class="ask-box">
      <label for="ask-input" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Ask ${esc(data.displayName)} a question</label>
      <input id="ask-input" maxlength="300" placeholder="What time do you open?">
      <button id="ask-submit" type="submit">Ask</button>
      <p id="ask-answer" class="ask-answer" hidden role="status"></p>
      <p class="ask-hint">Answers come only from this shop's own information. Please call to confirm anything important.</p>
    </form>
  </section>`
      : ''
  }

  <section class="card-section">
    <h2>More</h2>
    <div class="chips">
      ${data.profile.websiteUrl ? `<a class="btn btn-secondary" data-track="cta_website" rel="noopener" href="${attr(data.profile.websiteUrl)}" style="padding:0 1rem;display:inline-flex">Website</a>` : ''}
      ${data.profile.gbpReviewUrl ? `<a class="btn btn-secondary" data-track="cta_social" rel="noopener" href="${attr(data.profile.gbpReviewUrl)}" style="padding:0 1rem;display:inline-flex">Leave a review</a>` : ''}
      ${socials}
      <a class="btn btn-secondary" data-track="cta_save_contact" href="/m/${attr(data.slug)}/contact.vcf" style="padding:0 1rem;display:inline-flex">Save contact</a>
    </div>
  </section>

  <footer>
    <p>${esc(data.displayName)} · <span style="font-family:monospace">/m/${esc(data.slug)}</span></p>
    <p style="margin-top:0.5rem"><a href="/" style="text-decoration:underline">Get a page like this for your shop</a></p>
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
  <a href="/" class="btn btn-secondary" style="margin-top:1.5rem;padding:0 1.25rem;display:inline-flex">Go to the home page</a>
</div>
</body>
</html>`;
}
