import { loadPublicPage } from '@/modules/merchants/public-page';
import {
  INLINE_SCRIPT_CSP_HASH,
  renderMerchantPageHtml,
  renderNotFoundHtml,
  renderStatusPageHtml,
} from '@/modules/merchants/render-html';
import { env } from '@/modules/core/env';

export const runtime = 'nodejs';

/**
 * Strict CSP for this route. `INLINE_SCRIPT_CSP_HASH` allow-lists the ONE
 * constant inline script by its SHA-256 hash rather than using
 * `'unsafe-inline'` — see render-html.ts for why the script had to be made
 * content-constant across all merchants for this to be possible.
 * `img-src` allows same-origin plus data: for any inline SVG/placeholder use.
 */
const CSP = [
  `default-src 'none'`,
  `script-src 'self' ${INLINE_SCRIPT_CSP_HASH}`,
  `style-src 'self' 'unsafe-inline'`, // inline <style> block only; no inline event handlers rely on this
  `img-src 'self' data:`,
  `connect-src 'self'`,
  `font-src 'self'`,
  `object-src 'none'`,
  `base-uri 'none'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
].join('; ');

/**
 * The public merchant page, served as a plain Route Handler rather than a
 * React page.
 *
 * See the header comment in `modules/merchants/render-html.ts` for why: the
 * Next.js App Router's client runtime attaches at the root layout and loads
 * on every page regardless of that page's own client-component usage, which
 * put a "pure server component" version of this page at ~174 KB gzipped JS -
 * far past the ≤30 KB budget this page exists to meet. A Route Handler
 * returns a plain `Response` with no React and no framework bundle attached,
 * so the only JavaScript the customer downloads is the one small inline
 * script this route writes itself.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const origin = env().PUBLIC_QR_ORIGIN;
  const result = await loadPublicPage(slug);

  const html = (body: string, status: number, cacheable: boolean) =>
    new Response(body, {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': CSP,
        // X-Content-Type-Options, Referrer-Policy etc. are set globally for
        // every route in next.config.ts; only CSP needs to be route-specific.
        // CDN-level caching stands in for ISR here (a Route Handler doesn't
        // get Next's page-level revalidate). stale-while-revalidate keeps
        // scans fast while a merchant's edit propagates within a minute.
        'Cache-Control': cacheable
          ? 'public, s-maxage=60, stale-while-revalidate=300'
          : 'private, no-store',
      },
    });

  switch (result.kind) {
    case 'redirect': {
      const url = new URL(request.url);
      url.pathname = `/m/${result.toSlug}`;
      // Permanent: the old slug is a permanent alias, never a temporary one.
      return Response.redirect(url, 308);
    }
    case 'not_found':
      return html(renderNotFoundHtml(), 404, false);
    case 'coming_soon':
    case 'suspended':
      return html(renderStatusPageHtml(result.kind, result.displayName), 200, false);
    case 'gone':
      // 410, not 404: the address is correct, the listing has been removed.
      return html(renderStatusPageHtml('gone', result.displayName), 410, false);
    case 'ok':
      return html(renderMerchantPageHtml(result.data, origin), 200, true);
  }
}
