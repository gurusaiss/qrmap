import { notFound } from 'next/navigation';
import { requirePlatform } from '@/modules/auth/session-server';
import { getTenant } from '@/modules/merchants/tenants';
import { slugHistory } from '@/modules/merchants/slugs';
import { summary } from '@/modules/analytics';
import { listFeatureFlags } from '@/modules/platform/settings';
import { getTenantFeatureOverrides } from '@/modules/platform/features';
import { Badge, Card, PageHeader, Stat } from '@/components/ui';
import { DangerZone } from './danger-zone';
import { FeaturesCard } from './features-card';
import { ImpersonateButton } from './impersonate-button';

export const metadata = { title: 'Merchant' };

export default async function MerchantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; identifier?: string }>;
}) {
  await requirePlatform('platform:tenant:update');
  const { id } = await params;
  const { created, identifier } = await searchParams;

  const tenant = await getTenant(id);
  if (!tenant) notFound();

  const [slugs, stats, flags, overrides] = await Promise.all([
    slugHistory(id),
    summary(id, 30),
    listFeatureFlags(),
    getTenantFeatureOverrides(id),
  ]);
  const primary = slugs.find((s) => s.isPrimary);

  return (
    <div className="max-w-2xl">
      <PageHeader title={tenant.displayName} />

      <div className="mb-6 flex items-center gap-3">
        <Badge tone={tenant.status === 'active' ? 'success' : tenant.status === 'suspended' ? 'warning' : 'neutral'}>
          {tenant.status}
        </Badge>
        {primary && <span className="font-mono text-[14px] text-ink-500">/m/{primary.slug}</span>}
      </div>

      {created && identifier && (
        <Card className="mb-6 border-success-600/30 bg-success-50/40">
          <p className="font-semibold text-success-600">✓ {tenant.displayName} is set up</p>
          <p className="mt-1 text-[14px] text-ink-700">
            They sign in at the main site with{' '}
            <strong>{created === 'phone' ? `mobile number ${identifier} and the PIN` : `email ${identifier} and the password`}</strong>{' '}
            you just set — share that with them now (it won&apos;t be shown again).
          </p>
        </Card>
      )}

      <div className="mb-6">
        <ImpersonateButton tenantId={id} label={created ? `Go to ${tenant.displayName}'s dashboard` : undefined} />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Scans (30d)" value={stats.scans} />
        <Stat label="Leads (30d)" value={stats.leads} />
        <Stat label="Unique visitors" value={stats.uniqueVisitors} />
      </div>

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">Address history</h2>
        <p className="mb-3 text-[13px] text-ink-500">
          Every address ever assigned to this business. Retired addresses redirect to the current
          one forever — they are never reused.
        </p>
        <ul className="divide-y divide-ink-100">
          {slugs.map((s) => (
            <li key={s.slug} className="flex items-center justify-between py-2 text-[14px]">
              <span className="font-mono">/m/{s.slug}</span>
              <span className="text-ink-400">
                {s.isPrimary ? 'Current' : `Redirects to current · retired ${s.retiredAt?.toLocaleDateString() ?? ''}`}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <FeaturesCard tenantId={id} flags={flags} overrides={overrides} />

      <DangerZone tenantId={id} displayName={tenant.displayName} status={tenant.status} currentSlug={primary?.slug ?? ''} />
    </div>
  );
}
