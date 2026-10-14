import Link from 'next/link';
import { requirePlatform } from '@/modules/auth/session-server';
import { listTenants, platformStats, type TenantStatus } from '@/modules/merchants/tenants';
import { Badge, Button, ButtonLink, Card, Input, PageHeader, Stat } from '@/components/ui';

export const metadata = { title: 'Merchants' };

const STATUS_TONE = {
  draft: 'neutral',
  active: 'success',
  suspended: 'warning',
  deleted: 'danger',
} as const;

const STATUS_FILTERS: { label: string; status?: TenantStatus }[] = [
  { label: 'Total' },
  { label: 'Published', status: 'active' },
  { label: 'Draft', status: 'draft' },
  { label: 'Suspended', status: 'suspended' },
];

function filterHref(q: string | undefined, status: TenantStatus | undefined): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  const qs = params.toString();
  return qs ? `/admin?${qs}` : '/admin';
}

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: TenantStatus }>;
}) {
  await requirePlatform('platform:analytics:read');
  const { q, status } = await searchParams;
  const [stats, tenants] = await Promise.all([
    platformStats(),
    listTenants({ ...(q ? { query: q } : {}), ...(status ? { status } : {}) }),
  ]);

  const statValue: Record<string, number> = {
    Total: stats.total,
    Published: stats.published,
    Draft: stats.draft,
    Suspended: stats.suspended,
  };

  return (
    <div>
      <PageHeader title="Merchants" description="Every business on the platform." />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.label}
            href={filterHref(q, f.status)}
            className={`block rounded-[var(--radius-card)] transition-[box-shadow] ${status === f.status ? 'ring-2 ring-brand-600' : ''}`}
          >
            <Stat label={f.label} value={statValue[f.label] ?? 0} />
          </Link>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <form className="flex flex-1 max-w-sm gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <Input name="q" defaultValue={q} placeholder="Search by name or address…" />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <ButtonLink href="/admin/merchants/new">New merchant</ButtonLink>
      </div>

      {status && (
        <p className="mb-3 text-[13px] text-ink-500">
          Showing <strong className="text-ink-700">{status}</strong> merchants only ·{' '}
          <Link href={filterHref(q, undefined)} className="underline">
            Clear filter
          </Link>
        </p>
      )}

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
