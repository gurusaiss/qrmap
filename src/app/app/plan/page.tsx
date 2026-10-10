import { requireMerchant } from '@/modules/auth/session-server';
import { getCurrentPlan, getFreePlan, getUsage, listPublicPlans } from '@/modules/merchants/plan';
import { formatMoney } from '@/modules/core/money';
import { Badge, Card, PageHeader } from '@/components/ui';

export const metadata = { title: 'Plan & billing' };

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | undefined }) {
  const hasLimit = typeof limit === 'number' && limit > 0;
  const pct = hasLimit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const near = hasLimit && pct >= 90;

  return (
    <div>
      <div className="flex items-center justify-between text-[14px]">
        <span className="text-ink-700">{label}</span>
        <span className={near ? 'font-semibold text-warning-600' : 'text-ink-500'}>
          {used.toLocaleString('en-IN')}
          {hasLimit ? ` / ${limit.toLocaleString('en-IN')}` : ''}
        </span>
      </div>
      {hasLimit && (
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: near ? 'var(--color-warning-600)' : 'var(--color-brand-600)' }}
          />
        </div>
      )}
    </div>
  );
}

export default async function PlanPage() {
  const { tenantId } = await requireMerchant('billing:read');
  const [current, allPlans, usage] = await Promise.all([
    getCurrentPlan(tenantId),
    listPublicPlans(),
    getUsage(tenantId),
  ]);
  const plan = current ?? (await getFreePlan());

  return (
    <div>
      <PageHeader title="Plan & billing" description="What your business can do, and how much of it you're using." />

      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium uppercase tracking-wide text-ink-400">Current plan</p>
            <p className="mt-1 text-[20px] font-bold">{plan?.name ?? 'Free'}</p>
          </div>
          <Badge tone={plan?.priceMinor ? 'info' : 'neutral'}>
            {plan?.priceMinor ? `${formatMoney(plan.priceMinor, plan.currency as 'INR')}/${plan.interval}` : 'Free'}
          </Badge>
        </div>

        <div className="mt-5 space-y-4">
          <UsageBar label="Menu items" used={usage.catalogItems} limit={plan?.limits.catalogItems} />
          <UsageBar label="Active offers" used={usage.activeOffers} limit={plan?.limits.activeOffers} />
          <UsageBar
            label="Photos & media"
            used={Math.round(usage.mediaBytes / (1024 * 1024))}
            limit={plan?.limits.mediaMb}
          />
          <UsageBar
            label="AI questions this month"
            used={usage.aiQuestionsThisMonth}
            limit={plan?.limits.aiQuestionsPerMonth}
          />
        </div>
      </Card>

      {allPlans.length > 0 && (
        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-400">Available plans</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {allPlans.map((p) => (
              <Card key={p.key} className={p.key === plan?.key ? 'ring-2 ring-brand-600' : ''}>
                <p className="font-semibold">{p.name}</p>
                <p className="mt-1 text-[20px] font-bold tabular-nums">
                  {p.priceMinor ? formatMoney(p.priceMinor, p.currency as 'INR') : '₹0'}
                  <span className="text-[13px] font-normal text-ink-400">/{p.interval}</span>
                </p>
                <ul className="mt-3 space-y-1 text-[13px] text-ink-500">
                  {p.features.ai && <li>AI assistant</li>}
                  {p.features.website && <li>Website</li>}
                  {p.features.leadInbox && <li>Lead inbox</li>}
                  {p.features.removeBranding && <li>Remove platform branding</li>}
                </ul>
                {p.key === plan?.key && (
                  <Badge tone="success">Current plan</Badge>
                )}
              </Card>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-ink-400">
            Online upgrades aren&apos;t available yet. To change your plan, contact support and
            we&apos;ll help you switch.
          </p>
        </section>
      )}
    </div>
  );
}
