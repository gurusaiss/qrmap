import { requirePlatform } from '@/modules/auth/session-server';
import { listCategories, listFeatureFlags, listPlans } from '@/modules/platform/settings';
import { Card, PageHeader } from '@/components/ui';
import { CreateCategoryForm } from './create-category-form';
import { CategoryRow } from './category-row';
import { PlanRow } from './plan-row';
import { FlagRow } from './flag-row';

export const metadata = { title: 'Platform settings' };

export default async function SettingsPage() {
  await requirePlatform();
  const [categories, plans, flags] = await Promise.all([listCategories(), listPlans(), listFeatureFlags()]);

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
        <Card className="overflow-hidden p-0">
          <table className="w-full text-left text-[14px]">
            <tbody>
              {flags.map((flag) => (
                <FlagRow key={flag.key} flag={flag} />
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
