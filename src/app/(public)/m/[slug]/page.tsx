/**
 * The public merchant page.
 *
 * A React Server Component that ships effectively no client JavaScript. Every
 * call to action is a plain anchor (`tel:`, `wa.me`, a maps deep link), so the
 * page is fully functional with JavaScript disabled - which is the point, given
 * the customer is standing in a shop on a low-end phone and a slow network.
 */
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import { loadPublicPage, type PublicCatalogItem, type PublicPageData } from '@/modules/merchants/public-page';
import { formatPriceRange } from '@/modules/core/money';
import { env } from '@/modules/core/env';
import { StatusPage } from './status-page';
import { AskAssistant } from './ask-assistant';
import { TrackView } from './track';

export const revalidate = 60;
export const dynamic = 'force-static';
export const dynamicParams = true;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadPublicPage(slug);
  if (result.kind !== 'ok') {
    return { title: 'Business page', robots: { index: false, follow: false } };
  }
  const { data } = result;
  const description =
    data.profile.tagline ??
    data.profile.description?.slice(0, 155) ??
    `${data.displayName}${data.profile.city ? ` in ${data.profile.city}` : ''}. See services, prices, offers and contact details.`;

  return {
    title: `${data.displayName}${data.profile.city ? ` · ${data.profile.city}` : ''}`,
    description,
    alternates: { canonical: `${env().PUBLIC_QR_ORIGIN}/m/${data.slug}` },
    openGraph: {
      title: data.displayName,
      description,
      type: 'website',
      url: `${env().PUBLIC_QR_ORIGIN}/m/${data.slug}`,
    },
    robots: { index: true, follow: true },
  };
}

function localBusinessJsonLd(data: PublicPageData): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: data.displayName,
    description: data.profile.description ?? data.profile.tagline ?? undefined,
    telephone: data.profile.phone ?? undefined,
    url: `${env().PUBLIC_QR_ORIGIN}/m/${data.slug}`,
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

function directionsHref(data: PublicPageData): string | null {
  if (data.profile.googleMapsUrl) return data.profile.googleMapsUrl;
  const address = [data.profile.addressLine1, data.profile.addressLine2, data.profile.city, data.profile.state, data.profile.pincode]
    .filter(Boolean)
    .join(', ');
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
}

function whatsappHref(number: string): string {
  return `https://wa.me/${number.replace(/[^\d]/g, '')}`;
}

export default async function MerchantPage({ params }: Props) {
  const { slug } = await params;
  const result = await loadPublicPage(slug);

  // A printed QR must never 404 and never land on another business.
  if (result.kind === 'redirect') permanentRedirect(`/m/${result.toSlug}`);
  if (result.kind === 'not_found') notFound();
  if (result.kind !== 'ok') {
    return <StatusPage kind={result.kind} displayName={result.displayName} />;
  }

  const { data } = result;
  const directions = directionsHref(data);
  const accent = data.profile.accentColor ?? '#1D4ED8';

  return (
    <main
      className="mx-auto min-h-screen max-w-xl bg-white pb-24"
      style={{ ['--accent' as string]: accent }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: localBusinessJsonLd(data) }} />
      <TrackView tenantId={data.tenantId} />

      {/* ---------------- Above the fold ---------------- */}
      <header>
        <div className="h-40 w-full bg-ink-100" aria-hidden="true" style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}0a)` }} />
        <div className="px-4">
          <h1 className="mt-4 text-[22px] font-bold leading-tight tracking-tight">{data.displayName}</h1>
          <p className="mt-1 text-[15px] text-ink-500">
            {[data.categoryName, data.profile.city].filter(Boolean).join(' · ')}
          </p>

          <p className="mt-3 flex items-center gap-2 text-[15px] font-medium">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: data.openState.open ? 'var(--color-success-600)' : 'var(--color-ink-400)' }}
            />
            {data.openState.open ? (
              <span className="text-success-600">
                Open now{data.openState.closingSoon ? ` · closes ${data.openState.closesAt}` : ` · until ${data.openState.closesAt}`}
              </span>
            ) : (
              <span className="text-ink-500">
                Closed
                {data.openState.reason === 'holiday' && data.openState.holidayLabel
                  ? ` · ${data.openState.holidayLabel}`
                  : ''}
                {data.openState.opensNext ? ` · ${data.openState.opensNext}` : ''}
              </span>
            )}
          </p>
        </div>
      </header>

      {/* One hero offer only: the first screen must not become a list. */}
      {data.heroOffer && (
        <section className="mx-4 mt-4 rounded-[14px] border p-4" style={{ borderColor: `${accent}40`, background: `${accent}0d` }}>
          <p className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
            Current offer
          </p>
          <h2 className="mt-1 text-lg font-bold">{data.heroOffer.title}</h2>
          {data.heroOffer.description && <p className="mt-1 text-[15px] text-ink-700">{data.heroOffer.description}</p>}
          <p className="mt-2 text-[13px] text-ink-500">{data.heroOffer.validity}</p>
          {data.heroOffer.couponCode && (
            <p className="mt-2 inline-block rounded-md border border-dashed border-ink-400 px-2 py-1 font-mono text-[15px]">
              {data.heroOffer.couponCode}
            </p>
          )}
        </section>
      )}

      {/* Primary actions: plain anchors, no JavaScript required. */}
      <nav aria-label="Contact this business" className="sticky top-0 z-10 mt-4 grid grid-cols-3 gap-2 border-b border-ink-100 bg-white/95 px-4 py-3 backdrop-blur">
        {data.profile.phone && (
          <a
            href={`tel:${data.profile.phone}`}
            data-track="cta_call"
            className="tap-target flex flex-col items-center justify-center rounded-xl text-[13px] font-semibold text-white"
            style={{ background: accent }}
          >
            Call
          </a>
        )}
        {data.profile.whatsapp && (
          <a
            href={whatsappHref(data.profile.whatsapp)}
            data-track="cta_whatsapp"
            rel="noopener"
            className="tap-target flex flex-col items-center justify-center rounded-xl border border-ink-200 text-[13px] font-semibold"
          >
            WhatsApp
          </a>
        )}
        {directions && (
          <a
            href={directions}
            data-track="cta_directions"
            rel="noopener"
            className="tap-target flex flex-col items-center justify-center rounded-xl border border-ink-200 text-[13px] font-semibold"
          >
            Directions
          </a>
        )}
      </nav>

      {/* ---------------- Below the fold ---------------- */}
      {data.offers.length > 0 && (
        <Section title="More offers">
          <ul className="space-y-3">
            {data.offers.map((offer) => (
              <li key={offer.id} className="card p-3">
                <h3 className="font-semibold">{offer.title}</h3>
                {offer.description && <p className="mt-1 text-[15px] text-ink-700">{offer.description}</p>}
                <p className="mt-1 text-[13px] text-ink-500">{offer.validity}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.services.length > 0 && (
        <Section title={data.templateKey === 'menu' ? 'Menu' : 'Services'}>
          <CatalogList items={data.services} />
        </Section>
      )}

      {data.products.length > 0 && (
        <Section title="Products">
          <CatalogList items={data.products} wholesale={data.templateKey === 'wholesale'} />
        </Section>
      )}

      {data.profile.description && (
        <Section title="About">
          <p className="text-[15px] leading-relaxed text-ink-700">{data.profile.description}</p>
        </Section>
      )}

      <Section title="Opening hours">
        <ul className="text-[15px]">
          {data.week.map((day) => (
            <li key={day.dayOfWeek} className="flex justify-between border-b border-ink-100 py-2 last:border-0">
              <span className="text-ink-700">{day.day}</span>
              <span className={day.windows.length ? 'font-medium' : 'text-ink-400'}>
                {day.windows.length ? day.windows.join(', ') : 'Closed'}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {(data.profile.addressLine1 ?? data.profile.city) && (
        <Section title="Find us">
          <address className="not-italic text-[15px] leading-relaxed text-ink-700">
            {[data.profile.addressLine1, data.profile.addressLine2, data.profile.city, data.profile.state, data.profile.pincode]
              .filter(Boolean)
              .join(', ')}
          </address>
          {directions && (
            <a href={directions} data-track="cta_directions" rel="noopener" className="tap-target mt-3 inline-flex items-center rounded-lg border border-ink-200 px-4 font-semibold">
              Open in Maps
            </a>
          )}
        </Section>
      )}

      {data.aiEnabled && <AskAssistant slug={data.slug} businessName={data.displayName} />}

      <Section title="More">
        <div className="flex flex-wrap gap-2">
          {data.profile.websiteUrl && (
            <a href={data.profile.websiteUrl} data-track="cta_website" rel="noopener" className="tap-target inline-flex items-center rounded-lg border border-ink-200 px-4 text-[15px] font-medium">
              Website
            </a>
          )}
          {data.profile.gbpReviewUrl && (
            <a href={data.profile.gbpReviewUrl} data-track="cta_social" rel="noopener" className="tap-target inline-flex items-center rounded-lg border border-ink-200 px-4 text-[15px] font-medium">
              Leave a review
            </a>
          )}
          {Object.entries(data.profile.socials).map(([name, url]) => (
            <a key={name} href={url} data-track="cta_social" rel="noopener" className="tap-target inline-flex items-center rounded-lg border border-ink-200 px-4 text-[15px] font-medium capitalize">
              {name}
            </a>
          ))}
          <a href={`/m/${data.slug}/contact.vcf`} data-track="cta_save_contact" className="tap-target inline-flex items-center rounded-lg border border-ink-200 px-4 text-[15px] font-medium">
            Save contact
          </a>
        </div>
      </Section>

      <footer className="mt-10 px-4 pb-8 text-center text-[13px] text-ink-400">
        <p>
          {data.displayName} · <span className="font-mono">{`/m/${data.slug}`}</span>
        </p>
        <p className="mt-2">
          <Link href="/" className="underline">
            Get a page like this for your shop
          </Link>
        </p>
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 px-4" data-section={title}>
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-400">{title}</h2>
      {children}
    </section>
  );
}

function CatalogList({ items, wholesale = false }: { items: PublicCatalogItem[]; wholesale?: boolean }) {
  return (
    <ul className="card divide-y divide-ink-100">
      {items.map((item) => (
        <li key={item.id} className="flex items-start justify-between gap-4 p-3">
          <div className="min-w-0">
            <h3 className="font-medium">{item.name}</h3>
            {item.description && <p className="mt-0.5 text-[14px] text-ink-500">{item.description}</p>}
            <p className="mt-0.5 text-[13px] text-ink-400">
              {[
                item.durationMinutes ? `${item.durationMinutes} min` : null,
                wholesale && item.minOrderQty ? `Min order ${item.minOrderQty}` : null,
                item.stockStatus && item.stockStatus !== 'in_stock' ? item.stockStatus.replace(/_/g, ' ') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span className="font-semibold tabular-nums">
              {formatPriceRange(item.priceMinor, item.priceMaxMinor, item.priceUnit)}
            </span>
            {item.compareAtMinor && item.priceMinor && item.compareAtMinor > item.priceMinor && (
              <span className="ml-2 text-[14px] text-ink-400 line-through tabular-nums">
                {formatPriceRange(item.compareAtMinor, null, null)}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
