import { loadPublicPage } from '@/modules/merchants/public-page';

/** vCard download so a customer can save the shop to their phonebook. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await loadPublicPage(slug);
  if (result.kind !== 'ok') return new Response('Not found', { status: 404 });

  const { data } = result;
  const address = [data.profile.addressLine1, data.profile.city, data.profile.state, data.profile.pincode]
    .filter(Boolean)
    .join(', ');

  const card = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${data.displayName}`,
    `ORG:${data.displayName}`,
    data.profile.phone ? `TEL;TYPE=WORK,VOICE:${data.profile.phone}` : null,
    data.profile.email ? `EMAIL:${data.profile.email}` : null,
    address ? `ADR;TYPE=WORK:;;${address}` : null,
    `URL:${process.env.PUBLIC_QR_ORIGIN ?? ''}/m/${data.slug}`,
    'END:VCARD',
  ]
    .filter(Boolean)
    .join('\r\n');

  return new Response(card, {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="${data.slug}.vcf"`,
      'Cache-Control': 'public, max-age=300',
    },
  });
}
