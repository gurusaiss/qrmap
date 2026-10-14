import { notFound } from 'next/navigation';
import { requireMerchant } from '@/modules/auth/session-server';
import { getOffer, listMedia } from '@/modules/merchants/content';
import { PageHeader } from '@/components/ui';
import { EditOfferForm } from './edit-form';

export const metadata = { title: 'Edit offer' };

function toDateInput(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : '';
}

export default async function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { tenantId } = await requireMerchant('offers:write');
  const { id } = await params;

  const [offer, media] = await Promise.all([getOffer(tenantId, id), listMedia(tenantId)]);
  if (!offer) notFound();

  return (
    <div>
      <PageHeader title="Edit offer" />
      <EditOfferForm
        offerId={offer.id}
        photos={media.map((m) => ({ id: m.id, altText: m.altText }))}
        initial={{
          title: offer.title,
          description: offer.description ?? '',
          startsAt: toDateInput(offer.startsAt),
          endsAt: toDateInput(offer.endsAt),
          weekendOnly: Boolean(offer.activeWeekdays?.includes(0) && offer.activeWeekdays?.includes(6)),
          couponCode: offer.couponCode ?? '',
          isPublished: offer.isPublished,
          mediaId: offer.mediaId ?? '',
        }}
      />
    </div>
  );
}
