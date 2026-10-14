import { requireMerchant } from '@/modules/auth/session-server';
import { primarySlugFor } from '@/modules/merchants/slugs';
import { getProfile, getQrPrintPrefs } from '@/modules/merchants/content';
import { minimumPrintSizeMm, publicUrlForSlug } from '@/modules/qr';
import { env } from '@/modules/core/env';
import { Badge, ButtonLink, Card, IconCheck, PageHeader } from '@/components/ui';
import { QrCustomizer } from './qr-customizer';
import { QrFieldsForm } from './qr-fields-form';

export const metadata = { title: 'Your QR code' };

export default async function QrPage() {
  const { tenantId } = await requireMerchant('qr:read');
  const [slug, { profile }, prefs] = await Promise.all([
    primarySlugFor(tenantId),
    getProfile(tenantId),
    getQrPrintPrefs(tenantId),
  ]);

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
        <Badge tone="success" dot>
          Permanent
        </Badge>
        <img
          src={`/api/qr/${slug}.png?size=600`}
          alt={`QR code linking to ${url}`}
          width={280}
          height={280}
          className="rounded-[var(--radius-sm)] border border-ink-200 shadow-[var(--shadow-card)]"
        />
        <p className="break-all font-mono text-[14px] text-ink-500">{url}</p>

        <div className="flex w-full flex-wrap justify-center gap-2">
          <ButtonLink href={`/api/qr/${slug}.pdf`} download>
            Download printable standee (PDF)
          </ButtonLink>
          <ButtonLink href={`/api/qr/${slug}.png?size=1600`} variant="secondary" download>
            Download PNG
          </ButtonLink>
          <ButtonLink href={`/api/qr/${slug}.svg`} variant="secondary" download>
            Download SVG (for banners)
          </ButtonLink>
        </div>
      </Card>

      <div className="mt-4">
        <QrFieldsForm
          initial={{
            showName: prefs.showName ?? true,
            showTagline: prefs.showTagline ?? false,
            showAddress: prefs.showAddress ?? false,
            showPhone: prefs.showPhone ?? false,
            callToAction: prefs.callToAction ?? '',
          }}
          hasTagline={Boolean(profile?.tagline)}
          hasAddress={Boolean(profile?.addressLine1 || profile?.city)}
          hasPhone={Boolean(profile?.phone)}
        />
      </div>

      <div className="mt-4">
        <QrCustomizer slug={slug} />
      </div>

      <Card className="mt-4">
        <h2 className="font-display text-[16px] font-semibold">This code never changes</h2>
        <p className="mt-1 text-[15px] text-ink-500">
          Print it once and place it anywhere — the counter, your door, packaging, receipts. When
          you update your prices or offers, the same code shows the new information automatically.
          You never need to print a new one.
        </p>
      </Card>

      <Card className="mt-4">
        <h2 className="font-display text-[16px] font-semibold">Printing tips</h2>
        <ul className="mt-3 space-y-2.5">
          {[
            `Print at least ${minSize}mm × ${minSize}mm so phones can scan it easily.`,
            "Keep some plain space around the code — don't crowd it with other text.",
            'Dark code on a light background scans best.',
            'A code on a table tent or counter usually gets scanned more than one on a wall.',
          ].map((tip) => (
            <li key={tip} className="flex items-start gap-2.5 text-[15px] text-ink-500">
              <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-600" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
