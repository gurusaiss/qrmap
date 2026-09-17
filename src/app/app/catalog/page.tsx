import { requireMerchant } from '@/modules/auth/session-server';
import { listCatalog } from '@/modules/merchants/content';
import { EmptyState, PageHeader } from '@/components/ui';
import { CatalogForm } from './catalog-form';
import { CatalogItemRow } from './catalog-item-row';

export const metadata = { title: 'Menu & prices' };

export default async function CatalogPage() {
  const { tenantId } = await requireMerchant('catalog:read');
  const items = await listCatalog(tenantId, { includeUnavailable: true });

  return (
    <div>
      <PageHeader
        title="Menu & prices"
        description="Add what you sell. Customers see this the moment you save."
      />
      <CatalogForm />

      <div className="mt-6 space-y-3">
        {items.length === 0 ? (
          <EmptyState
            title="Nothing added yet"
            body="Add your first service or product above — it appears on your page immediately."
          />
        ) : (
          items.map((item) => <CatalogItemRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
