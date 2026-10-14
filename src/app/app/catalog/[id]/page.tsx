import { notFound } from 'next/navigation';
import { requireMerchant } from '@/modules/auth/session-server';
import { getCatalogItem, listCatalogGroups, listMedia } from '@/modules/merchants/content';
import { pickVariant } from '@/modules/media/upload';
import { PageHeader } from '@/components/ui';
import { EditCatalogItemForm } from './edit-form';

export const metadata = { title: 'Edit item' };

export default async function EditCatalogItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { tenantId } = await requireMerchant('catalog:write');
  const { id } = await params;

  const [item, media, groups] = await Promise.all([
    getCatalogItem(tenantId, id),
    listMedia(tenantId),
    listCatalogGroups(tenantId),
  ]);
  if (!item) notFound();

  const currentPhoto = item.mediaId ? media.find((m) => m.id === item.mediaId) : null;
  const currentPhotoKey = currentPhoto
    ? (pickVariant(currentPhoto.variants as Record<string, string>, 'webp', 160) ??
      pickVariant(currentPhoto.variants as Record<string, string>, 'avif', 160))
    : null;

  return (
    <div>
      <PageHeader title={`Edit ${item.kind === 'service' ? 'service' : 'product'}`} />
      <EditCatalogItemForm
        itemId={item.id}
        kind={item.kind}
        currentPhotoUrl={currentPhotoKey ? `/api/media/${currentPhotoKey}` : null}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        initial={{
          name: item.name,
          description: item.description ?? '',
          price: item.priceMinor != null ? (item.priceMinor / 100).toString() : '',
          priceMax: item.priceMaxMinor != null ? (item.priceMaxMinor / 100).toString() : '',
          priceUnit: item.priceUnit ?? '',
          durationMinutes: item.durationMinutes != null ? item.durationMinutes.toString() : '',
          minOrderQty: item.minOrderQty != null ? item.minOrderQty.toString() : '',
          stockStatus: item.stockStatus ?? '',
          groupId: item.groupId ?? '',
        }}
      />
    </div>
  );
}
