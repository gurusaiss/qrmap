import {
  QrContrastError,
  QrVerificationError,
  publicUrlForSlug,
  renderStandeePdf,
  renderVerifiedPng,
  renderVerifiedSvg,
} from '@/modules/qr';
import { resolveSlug } from '@/modules/merchants/slugs';
import { getProfile, getQrPrintPrefs } from '@/modules/merchants/content';
import { env } from '@/modules/core/env';

export const runtime = 'nodejs';

/**
 * Renders the QR for a slug, as a bare image (.png/.svg) or as a print-ready
 * standee (.pdf) carrying whichever merchant info fields were chosen in
 * Settings → QR code (src/modules/merchants/content.ts qr print prefs).
 *
 * The encoded URL is derived from the slug on every request, so there is no
 * stored image that could drift from the address it claims to represent. An
 * alias resolves to the tenant's CURRENT canonical slug.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params;

  const match = /^(?<name>[a-z0-9-]+)(?:\.(?<ext>png|svg|pdf))?$/.exec(raw);
  const name = match?.groups?.['name'];
  const extension = match?.groups?.['ext'] ?? 'png';
  if (!name) return new Response('Not found', { status: 404 });

  const resolution = await resolveSlug(name);
  if (resolution.kind === 'unknown') return new Response('Not found', { status: 404 });

  const canonical = resolution.kind === 'canonical' ? resolution.slug : resolution.canonicalSlug;
  const url = publicUrlForSlug(env().PUBLIC_QR_ORIGIN, canonical);

  const search = new URL(request.url).searchParams;
  const style = {
    size: Math.min(Math.max(Number(search.get('size') ?? 1024) || 1024, 128), 2048),
    foreground: search.get('fg') ?? '#000000',
    background: search.get('bg') ?? '#FFFFFF',
    withLogo: search.get('logo') === '1',
  };

  try {
    if (extension === 'pdf') {
      const [{ profile, tenant }, prefs] = await Promise.all([
        getProfile(resolution.tenantId),
        getQrPrintPrefs(resolution.tenantId),
      ]);
      if (!tenant) return new Response('Not found', { status: 404 });

      const address = [profile?.addressLine1, profile?.addressLine2, profile?.city, profile?.state, profile?.pincode]
        .filter(Boolean)
        .join(', ');

      const pdf = await renderStandeePdf({
        url,
        businessName: tenant.displayName,
        tagline: profile?.tagline ?? null,
        address: address || null,
        phone: profile?.phone ?? null,
        callToAction: prefs.callToAction ?? undefined,
        fields: {
          showName: prefs.showName,
          showTagline: prefs.showTagline,
          showAddress: prefs.showAddress,
          showPhone: prefs.showPhone,
        },
        style,
      });
      return new Response(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${canonical}-qr-standee.pdf"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    if (extension === 'svg') {
      // Verified: a code that does not decode back to this exact URL is never served.
      const svg = await renderVerifiedSvg(url, style);
      return new Response(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400, immutable',
        },
      });
    }

    // Verified: a code that does not decode back to this exact URL is never served.
    const png = await renderVerifiedPng(url, style);
    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (error) {
    if (error instanceof QrContrastError || error instanceof QrVerificationError) {
      return new Response(error.message, { status: 400 });
    }
    throw error;
  }
}
