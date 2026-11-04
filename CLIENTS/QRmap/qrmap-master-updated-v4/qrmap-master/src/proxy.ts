import { NextResponse, type NextRequest } from 'next/server';

/**
 * Nonce-based CSP for every React-rendered route (dashboard, admin console,
 * login, home). The public merchant page (`/m/*`) and short-QR alias
 * (`/q/*`) are excluded by the matcher below — they set their own strict,
 * hash-based CSP directly in their Route Handler (see
 * `app/(public)/m/[slug]/route.ts`), which is possible there only because
 * that page's one inline script is content-constant. React's own hydration
 * bootstrap script is NOT content-constant (it embeds render-specific data),
 * so it needs a per-request nonce instead of a hash.
 *
 * This is the standard Next.js App Router CSP recipe: generate a nonce per
 * request, forward it to the framework via a request header so Next attaches
 * it to its own injected scripts, and set the same nonce in the response's
 * CSP header.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `connect-src 'self'`,
    `font-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  // X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy
  // and HSTS are set globally for every route in next.config.ts; only CSP is
  // route-shape-specific enough to belong here.
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    // Every route EXCEPT: the public merchant page and short-QR alias (which
    // set their own CSP), API routes (JSON/binary responses, CSP is moot),
    // and Next's own static assets.
    '/((?!m/|q/|api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
