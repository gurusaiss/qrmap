import { notFound } from 'next/navigation';
import { requireMerchant } from '@/modules/auth/session-server';
import { getCatalogItem, listMedia } from '@/modules/merchants/content';
import { PageHeader } from '@/components/ui';
import { EditCatalogItemForm } from './edit-form';

export const metadata = { title: 'Edit item' };

export default async function EditCatalogItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { tenantId } = await requireMerchant('catalog:write');
  const { id } = await params;

  const [item, media] = await Promise.all([getCatalogItem(tenantId, id), listMedia(tenantId)]);
  if (!item) notFound();

  return (
    <div>
      <PageHeader title={`Edit ${item.kind === 'service' ? 'service' : 'product'}`} />
      <EditCatalogItemForm
        itemId={item.id}
        kind={item.kind}
        photos={media.map((m) => ({ id: m.id, altText: m.altText }))}
        initial={{
          name: item.name,
          description: item.description ?? '',
          price: item.priceMinor != null ? (item.priceMinor / 100).toString() : '',
          priceMax: item.priceMaxMinor != null ? (item.priceMaxMinor / 100).toString() : '',
          priceUnit: item.priceUnit ?? '',
          durationMinutes: item.durationMinutes != null ? item.durationMinutes.toString() : '',
          minOrderQty: item.minOrderQty != null ? item.minOrderQty.toString() : '',
          stockStatus: item.stockStatus ?? '',
          mediaId: item.mediaId ?? '',
        }}
      />
    </div>
  );
}
