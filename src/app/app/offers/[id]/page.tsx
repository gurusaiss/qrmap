import { notFound } from 'next/navigation';
import { requireMerchant } from '@/modules/auth/session-server';
import { getOffer, listMedia } from '@/modules/merchants/content';
import { pickVariant } from '@/modules/media/upload';
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

  const currentPhoto = offer.mediaId ? media.find((m) => m.id === offer.mediaId) : null;
  const currentPhotoKey = currentPhoto
    ? (pickVariant(currentPhoto.variants as Record<string, string>, 'webp', 160) ??
      pickVariant(currentPhoto.variants as Record<string, string>, 'avif', 160))
    : null;

  return (
    <div>
      <PageHeader title="Edit offer" />
      <EditOfferForm
        offerId={offer.id}
        currentPhotoUrl={currentPhotoKey ? `/api/media/${currentPhotoKey}` : null}
        initial={{
          title: offer.title,
          description: offer.description ?? '',
          startsAt: toDateInput(offer.startsAt),
          endsAt: toDateInput(offer.endsAt),
          weekendOnly: Boolean(offer.activeWeekdays?.includes(0) && offer.activeWeekdays?.includes(6)),
          couponCode: offer.couponCode ?? '',
          isPublished: offer.isPublished,
          discountType: offer.discountType,
          discountValue: offer.discountValueMinor != null ? (offer.discountValueMinor / 100).toString() : '',
          discountPercent: offer.discountPercent != null ? offer.discountPercent.toString() : '',
        }}
      />
    </div>
  );
}
