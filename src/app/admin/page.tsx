import Link from 'next/link';
import { requirePlatform } from '@/modules/auth/session-server';
import { listTenants, platformStats } from '@/modules/merchants/tenants';
import { Badge, ButtonLink, Card, Input, PageHeader, Stat } from '@/components/ui';

export const metadata = { title: 'Merchants' };

const STATUS_TONE = {
  draft: 'neutral',
  active: 'success',
  suspended: 'warning',
  deleted: 'danger',
} as const;

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePlatform('platform:analytics:read');
  const { q } = await searchParams;
  const [stats, tenants] = await Promise.all([
    platformStats(),
    listTenants(q ? { query: q } : {}),
  ]);

  return (
    <div>
      <PageHeader title="Merchants" description="Every business on the platform." />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={stats.total} />
        <Stat label="Published" value={stats.published} />
        <Stat label="Draft" value={stats.draft} />
        <Stat label="Suspended" value={stats.suspended} />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <form className="flex-1">
          <Input name="q" defaultValue={q} placeholder="Search by name or address…" className="max-w-sm" />
        </form>
        <ButtonLink href="/admin/merchants/new">New merchant</ButtonLink>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-left text-[14px]">
          <thead className="border-b border-ink-100 bg-ink-50 text-ink-500">
            <tr>
              <th className="px-4 py-2 font-medium">Business</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Address</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/merchants/${tenant.id}`} className="font-medium hover:underline">
                    {tenant.displayName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-500">{tenant.categoryName ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-[13px] text-ink-500">
                  {tenant.slug ? `/m/${tenant.slug}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[tenant.status]}>{tenant.status}</Badge>
                </td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-400">
                  No merchants found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
