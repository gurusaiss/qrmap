import Link from 'next/link';
import { requireMerchant } from '@/modules/auth/session-server';
import { getTenant } from '@/modules/merchants/tenants';
import { primarySlugFor } from '@/modules/merchants/slugs';
import { listCatalog, listOffers } from '@/modules/merchants/content';
import { summary } from '@/modules/analytics';
import { env } from '@/modules/core/env';
import { ButtonLink, Card, IconChevronRight, Stat } from '@/components/ui';
import { PublishControls } from './publish-controls';

export const metadata = { title: 'Your shop' };

/**
 * Dashboard home. Numbers in plain words, then one or two concrete next steps -
 * a merchant should never have to interpret a chart to know how they are doing.
 */
export default async function DashboardHome() {
  const { tenantId } = await requireMerchant('profile:read');
  const [tenant, slug, catalog, offers, stats] = await Promise.all([
    getTenant(tenantId),
    primarySlugFor(tenantId),
    listCatalog(tenantId, { includeUnavailable: true }),
    listOffers(tenantId),
    summary(tenantId, 7),
  ]);

  const pageUrl = slug ? `${env().PUBLIC_QR_ORIGIN}/m/${slug}` : null;
  const published = Boolean(tenant?.publishedAt);

  const nudges: { text: string; href: string }[] = [];
  if (catalog.length < 3) {
    nudges.push({ text: 'Add at least three items so customers can see what you offer.', href: '/app/catalog' });
  }
  if (offers.filter((o) => o.isPublished).length === 0) {
    nudges.push({ text: 'Post an offer — pages with a live offer get more attention.', href: '/app/offers' });
  }
  if (!published) {
    nudges.push({ text: 'Publish your page so the QR code works.', href: '/app/qr' });
  }

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-[13px] font-medium uppercase tracking-wide text-ink-400">Your page address</p>
        {pageUrl ? (
          <>
            <p className="mt-1 break-all font-mono text-[15px]">{pageUrl.replace(/^https?:\/\//, '')}</p>
            <p className="mt-2 text-[13px] text-ink-500">
              This address never changes. Print the QR once and keep using it.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ButtonLink href={`/m/${slug}`} variant="secondary" target="_blank" rel="noopener">
                View my page
              </ButtonLink>
              <ButtonLink href="/app/qr" variant="secondary">
                Get my QR code
              </ButtonLink>
            </div>
          </>
        ) : (
          <p className="mt-1 text-[15px] text-ink-500">Your address is being set up.</p>
        )}
      </Card>

      <PublishControls published={published} />

      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-400">Last 7 days</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Page opens" value={stats.scans} sub={`${stats.uniqueVisitors} different people`} />
          <Stat label="Customers who contacted you" value={stats.leads} sub={`${stats.calls} calls · ${stats.whatsapp} WhatsApp`} />
        </div>
      </section>

      {nudges.length > 0 && (
        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-400">Next steps</h2>
          <ul className="space-y-2">
            {nudges.map((nudge) => (
              <li key={nudge.text}>
                <Link href={nudge.href} className="card card-interactive flex items-center gap-3 p-3 text-[15px]">
                  <span className="min-w-0 flex-1">{nudge.text}</span>
                  <IconChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        <ButtonLink href="/app/profile" variant="secondary">
          Edit shop details
        </ButtonLink>
        <ButtonLink href="/app/catalog" variant="secondary">
          Edit prices
        </ButtonLink>
      </section>
    </div>
  );
}
