import { requireMerchant } from '@/modules/auth/session-server';
import { listMedia, listOffers } from '@/modules/merchants/content';
import { getTenant } from '@/modules/merchants/tenants';
import { offerStatus } from '@/modules/core/offers';
import { pickVariant } from '@/modules/media/upload';
import { EmptyState, PageHeader } from '@/components/ui';
import { OfferForm } from './offer-form';
import { OfferRow } from './offer-row';

export const metadata = { title: 'Offers' };

export default async function OffersPage() {
  const { tenantId } = await requireMerchant('offers:read');
  const [offers, tenant, media] = await Promise.all([listOffers(tenantId), getTenant(tenantId), listMedia(tenantId)]);
  const timezone = tenant?.timezone ?? 'Asia/Kolkata';
  const now = new Date();
  const mediaById = new Map(media.map((m) => [m.id, m]));
  const photoUrlFor = (mediaId: string | null): string | null => {
    const row = mediaId ? mediaById.get(mediaId) : undefined;
    if (!row) return null;
    const key = pickVariant(row.variants as Record<string, string>, 'webp', 160) ??
      pickVariant(row.variants as Record<string, string>, 'avif', 160);
    return key ? `/api/media/${key}` : null;
  };

  const withStatus = offers.map((offer) => ({
    offer,
    status: offerStatus(
      {
        isPublished: offer.isPublished,
        startsAt: offer.startsAt,
        endsAt: offer.endsAt,
        dailyStartTime: offer.dailyStartTime,
        dailyEndTime: offer.dailyEndTime,
        activeWeekdays: offer.activeWeekdays,
      },
      now,
      timezone,
    ),
  }));

  // Expired offers move to their own section so a festival offer can be reused
  // next year rather than being deleted.
  const active = withStatus.filter((o) => o.status !== 'expired');
  const ended = withStatus.filter((o) => o.status === 'expired');

  return (
    <div>
      <PageHeader
        title="Offers"
        description="Expired offers disappear from your page automatically — you never need to remove them by hand."
      />
      <OfferForm />

      <div className="mt-6 space-y-3">
        {active.length === 0 ? (
          <EmptyState title="No offers yet" body="Create one above — festival pricing works especially well." />
        ) : (
          active.map(({ offer, status }) => (
            <OfferRow key={offer.id} offer={offer} status={status} photoUrl={photoUrlFor(offer.mediaId)} />
          ))
        )}
      </div>

      {ended.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-400">Ended</h2>
          <div className="space-y-3">
            {ended.map(({ offer, status }) => (
              <OfferRow key={offer.id} offer={offer} status={status} photoUrl={photoUrlFor(offer.mediaId)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
