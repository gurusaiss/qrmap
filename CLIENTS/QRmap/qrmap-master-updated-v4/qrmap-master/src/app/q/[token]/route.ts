import { permanentRedirect } from 'next/navigation';
import { resolveQrToken } from '@/modules/merchants/slugs';

/**
 * The permanent short alias printed on small codes.
 *
 * It resolves through the QR token to whatever the tenant's CURRENT primary
 * slug is, so re-branding never breaks a code printed years earlier.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveQrToken(token);
  if (!resolved) return new Response('Not found', { status: 404 });
  permanentRedirect(`/m/${resolved.slug}?qr=1`);
}
