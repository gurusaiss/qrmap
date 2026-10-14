import { requirePlatform } from '@/modules/auth/session-server';
import { getPlatformSetting, listCategories, listFeatureFlags, listPlans } from '@/modules/platform/settings';
import { Card, PageHeader } from '@/components/ui';
import { CreateCategoryForm } from './create-category-form';
import { CategoryRow } from './category-row';
import { PlanRow } from './plan-row';
import { FlagRow } from './flag-row';
import { DomainSection } from './domain-section';

export const metadata = { title: 'Platform settings' };

export default async function SettingsPage() {
  await requirePlatform();
  const [categories, plans, flags, domainChangedAt] = await Promise.all([
    listCategories(),
    listPlans(),
    listFeatureFlags(),
    getPlatformSetting('domain_changed_at'),
  ]);

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader title="Platform settings" description="Categories, plans and feature flags — shared across every merchant." />

      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-400">Categories</h2>
        <p className="mb-3 text-[13px] text-ink-500">
          AI is off by default for high-liability verticals (medical) — see docs/06-AI-ARCHITECTURE.md §5.3.
        </p>
        <CreateCategoryForm />
        <Card className="mt-3 overflow-hidden p-0">
          <table className="w-full text-left text-[14px]">
            <thead className="border-b border-ink-100 bg-ink-50 text-ink-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Template</th>
                <th className="px-4 py-2 font-medium">AI enabled by default</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <CategoryRow key={c.id} category={c} />
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-400">Plans</h2>
        <p className="mb-3 text-[13px] text-ink-500">
          Limits are enforced in application code, so a pricing experiment is a data change here, not a deploy.
        </p>
        <div className="space-y-3">
          {plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-400">Feature flags</h2>
        <p className="mb-3 text-[13px] text-ink-500">
          A platform-wide kill switch for <code className="font-mono">ai_assistant</code>: turning it
          off here disables it for every merchant, overriding their own setting. To restrict just one
          merchant, use the Features card on that merchant&apos;s own page instead. The other flags
          here are placeholders for features not fully built yet, and toggling them does nothing
          today.
        </p>
        <Card className="overflow-hidden p-0">
          <table className="w-full text-left text-[14px]">
            <thead className="border-b border-ink-100 bg-ink-50 text-ink-500">
              <tr>
                <th className="px-4 py-2 font-medium">Flag</th>
                <th className="px-4 py-2 text-right font-medium">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((flag) => (
                <FlagRow key={flag.key} flag={flag} />
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-400">Domain</h2>
        <DomainSection lastChangedAt={domainChangedAt} />
      </section>
    </div>
  );
}
