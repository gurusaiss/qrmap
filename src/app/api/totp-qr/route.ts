import { renderPng } from '@/modules/qr';

export const runtime = 'nodejs';

/**
 * Renders a QR code for a TOTP enrolment URI only.
 *
 * Deliberately narrow: this is a generic "turn a string into a QR image"
 * capability, which would otherwise be a ready-made phishing tool (attacker
 * points a victim at `/api/totp-qr?uri=https://evil.example`, gets a
 * legitimate-looking code on our own domain). Restricted to the `otpauth://`
 * scheme, which no browser or user agent auto-navigates, so pointing this at
 * an arbitrary string cannot be used to make our domain host a phishing
 * redirect.
 *
 * Not gated on an existing session: this screen is shown DURING login,
 * before a session exists (2FA is the second of two pre-session steps). That
 * is not a secret-exposure risk — the same secret is already printed as
 * plain text ("manual entry key") on the same page; this endpoint only
 * turns text the user can already see into a QR image for convenience.
 */
export async function GET(request: Request) {
  const uri = new URL(request.url).searchParams.get('uri') ?? '';
  if (!uri.startsWith('otpauth://totp/') || uri.length > 500) {
    return new Response('Invalid request', { status: 400 });
  }

  const png = await renderPng(uri, { size: 400, withLogo: false });
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      // Never cache: this image encodes a TOTP secret.
      'Cache-Control': 'private, no-store',
    },
  });
}
