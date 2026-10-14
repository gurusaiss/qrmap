import Link from 'next/link';
import { requireMerchant } from '@/modules/auth/session-server';
import { listCatalog, listCatalogGroups, listMedia } from '@/modules/merchants/content';
import { pickVariant } from '@/modules/media/upload';
import { EmptyState, PageHeader } from '@/components/ui';
import { CatalogForm } from './catalog-form';
import { CategoryForm } from './category-form';
import { CategoryTile } from './category-tile';
import { CatalogItemRow } from './catalog-item-row';

export const metadata = { title: 'Menu & prices' };

export default async function CatalogPage() {
  const { tenantId } = await requireMerchant('catalog:read');
  const [allItems, uncategorised, groups, media] = await Promise.all([
    listCatalog(tenantId, { includeUnavailable: true }),
    listCatalog(tenantId, { includeUnavailable: true, groupId: null }),
    listCatalogGroups(tenantId),
    listMedia(tenantId),
  ]);
  const mediaById = new Map(media.map((m) => [m.id, m]));
  const photoUrlFor = (mediaId: string | null): string | null => {
    const row = mediaId ? mediaById.get(mediaId) : undefined;
    if (!row) return null;
    const key = pickVariant(row.variants as Record<string, string>, 'webp', 160) ??
      pickVariant(row.variants as Record<string, string>, 'avif', 160);
    return key ? `/api/media/${key}` : null;
  };

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

      <section className="mb-6">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-400">Categories</h2>
        <p className="mb-3 text-[13px] text-ink-500">
          Optional — group items like &quot;Breads&quot; or &quot;Cakes&quot; so customers can browse by type.
        </p>
        {groups.length > 0 && (
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {groups.map((g) => {
              const itemsInGroup = allItems.filter((i) => i.groupId === g.id);
              const cover = itemsInGroup.find((i) => i.mediaId)?.mediaId ?? null;
              return (
                <CategoryTile
                  key={g.id}
                  href={`/app/catalog/category/${g.id}`}
                  name={g.name}
                  itemCount={itemsInGroup.length}
                  photoUrl={photoUrlFor(cover)}
                />
              );
            })}
          </div>
        )}
        <CategoryForm />
      </section>

      <CatalogForm groups={groups.map((g) => ({ id: g.id, name: g.name }))} />

      <div className="mt-6 space-y-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-400">
          {groups.length > 0 ? 'Uncategorised' : 'All items'}
        </h2>
        {uncategorised.length === 0 ? (
          <EmptyState
            title="Nothing added yet"
            body="Add your first service or product above — it appears on your page immediately."
          />
        ) : (
          uncategorised.map((item) => (
            <CatalogItemRow key={item.id} item={item} photoUrl={photoUrlFor(item.mediaId)} />
          ))
        )}
      </div>
    </div>
  );
}
