import { requireMerchant } from '@/modules/auth/session-server';
import { primarySlugFor } from '@/modules/merchants/slugs';
import { minimumPrintSizeMm, publicUrlForSlug } from '@/modules/qr';
import { env } from '@/modules/core/env';
import { ButtonLink, Card, PageHeader } from '@/components/ui';

export const metadata = { title: 'Your QR code' };

export default async function QrPage() {
  const { tenantId } = await requireMerchant('qr:read');
  const slug = await primarySlugFor(tenantId);

  if (!slug) {
    return (
      <div>
        <PageHeader title="Your QR code" />
        <p className="text-[15px] text-ink-500">Your page is still being set up.</p>
      </div>
    );
  }

  const url = publicUrlForSlug(env().PUBLIC_QR_ORIGIN, slug);
  const minSize = minimumPrintSizeMm(url);

  return (
    <div>
      <PageHeader title="Your QR code" description="Print this once. It will keep working, even years from now." />

      <Card className="flex flex-col items-center gap-4 p-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/qr/${slug}.png?size=600`}
          alt={`QR code linking to ${url}`}
          width={280}
          height={280}
          className="rounded-lg border border-ink-200"
        />
        <p className="break-all font-mono text-[14px] text-ink-500">{url}</p>

        <div className="flex w-full flex-wrap justify-center gap-2">
          <ButtonLink href={`/api/qr/${slug}.png?size=1600`} variant="secondary" download>
            Download PNG
          </ButtonLink>
          <ButtonLink href={`/api/qr/${slug}.svg`} variant="secondary" download>
            Download SVG (for banners)
          </ButtonLink>
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">This code never changes</h2>
        <p className="mt-1 text-[15px] text-ink-500">
          Print it once and place it anywhere — the counter, your door, packaging, receipts. When
          you update your prices or offers, the same code shows the new information automatically.
          You never need to print a new one.
        </p>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Printing tips</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-ink-500">
          <li>Print at least {minSize}mm × {minSize}mm so phones can scan it easily.</li>
          <li>Keep some plain space around the code — don&apos;t crowd it with other text.</li>
          <li>Dark code on a light background scans best.</li>
          <li>A code on a table tent or counter usually gets scanned more than one on a wall.</li>
        </ul>
      </Card>
    </div>
  );
}
