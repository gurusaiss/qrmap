import Link from 'next/link';
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

      <Link
        href="/app/catalog/import"
        className="card card-interactive mb-4 flex items-center justify-between gap-3 p-4"
      >
        <div>
          <p className="font-medium">Already have a price list?</p>
          <p className="text-[13px] text-ink-500">
            Upload a spreadsheet, PDF, Word doc, or a photo — we&apos;ll fill this in for you.
          </p>
        </div>
        <span className="shrink-0 text-ink-400">→</span>
      </Link>

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
