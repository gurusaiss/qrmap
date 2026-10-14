import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMerchant } from '@/modules/auth/session-server';
import { getCatalogGroup, listCatalog, listCatalogGroups, listMedia } from '@/modules/merchants/content';
import { pickVariant } from '@/modules/media/upload';
import { EmptyState } from '@/components/ui';
import { CatalogForm } from '../../catalog-form';
import { CatalogItemRow } from '../../catalog-item-row';
import { GroupHeader } from './group-header';

export const metadata = { title: 'Category' };

export default async function CategoryPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { tenantId } = await requireMerchant('catalog:read');
  const { groupId } = await params;

  const [group, items, groups, media] = await Promise.all([
    getCatalogGroup(tenantId, groupId),
    listCatalog(tenantId, { includeUnavailable: true, groupId }),
    listCatalogGroups(tenantId),
    listMedia(tenantId),
  ]);
  if (!group) notFound();

  const mediaById = new Map(media.map((m) => [m.id, m]));
  const photoUrlFor = (mediaId: string | null): string | null => {
    const row = mediaId ? mediaById.get(mediaId) : undefined;
    if (!row) return null;
    const key =
      pickVariant(row.variants as Record<string, string>, 'webp', 160) ??
      pickVariant(row.variants as Record<string, string>, 'avif', 160);
    return key ? `/api/media/${key}` : null;
  };

  return (
    <div>
      <Link href="/app/catalog" className="mb-3 inline-block text-[14px] text-ink-500 underline">
        ← All categories
      </Link>

      <div className="mb-4">
        <GroupHeader groupId={group.id} name={group.name} />
      </div>

      <CatalogForm groups={groups.map((g) => ({ id: g.id, name: g.name }))} defaultGroupId={group.id} />

      <div className="mt-6 space-y-3">
        {items.length === 0 ? (
          <EmptyState
            title="Nothing in this category yet"
            body="Add your first item above — it appears on your page immediately."
          />
        ) : (
          items.map((item) => (
            <CatalogItemRow key={item.id} item={item} photoUrl={photoUrlFor(item.mediaId)} />
          ))
        )}
      </div>
    </div>
  );
}
