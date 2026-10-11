import { requireMerchant } from '@/modules/auth/session-server';
import { scanHeatmap, summary, topOffers, topQuestions } from '@/modules/analytics';
import { Badge, Card, PageHeader, Stat } from '@/components/ui';

export const metadata = { title: 'Insights' };

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async function InsightsPage() {
  const { tenantId } = await requireMerchant('analytics:read');
  const [stats, offers, heatmap, questions] = await Promise.all([
    summary(tenantId, 30),
    topOffers(tenantId, 30),
    scanHeatmap(tenantId, 60),
    topQuestions(tenantId, 30),
  ]);

  const busiestDay = heatmap.reduce<{ weekday: number; count: number } | null>((best, row) => {
    const dayTotal = heatmap.filter((r) => r.weekday === row.weekday).reduce((s, r) => s + r.count, 0);
    return !best || dayTotal > best.count ? { weekday: row.weekday, count: dayTotal } : best;
  }, null);

  return (
    <div className="space-y-6">
      <PageHeader title="Insights" description="Last 30 days, in plain numbers." />

      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-400">
          Is my page bringing customers?
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Page opens" value={stats.scans} sub={`${stats.uniqueVisitors} different people`} />
          <Stat label="Contacted you" value={stats.leads} sub={`${stats.calls} calls · ${stats.whatsapp} WhatsApp`} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-400">
          Which offers get attention?
        </h2>
        {offers.filter((o) => o.views > 0 || o.clicks > 0).length === 0 ? (
          <p className="text-[14px] text-ink-400">No offer activity yet this month.</p>
        ) : (
          <Card>
            <ul className="divide-y divide-ink-100">
              {offers
                .filter((o) => o.views > 0 || o.clicks > 0)
                .map((o) => (
                  <li key={o.offerId} className="flex items-center justify-between py-2 text-[15px]">
                    <span className="truncate pr-3">{o.title}</span>
                    <span className="shrink-0 text-ink-500 tabular-nums">{o.views} views</span>
                  </li>
                ))}
            </ul>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-400">
          When do people scan?
        </h2>
        <Card>
          {busiestDay && busiestDay.count > 0 ? (
            <p className="flex items-center gap-2 text-[15px]">
              Busiest day
              <Badge tone="info">{DAY_NAMES[busiestDay.weekday]}</Badge>
            </p>
          ) : (
            <p className="text-[14px] text-ink-400">Not enough activity yet to show a pattern.</p>
          )}
        </Card>
      </section>

      {questions.length > 0 && (
        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-400">
            What customers asked your assistant
          </h2>
          <Card>
            <ul className="divide-y divide-ink-100">
              {questions.slice(0, 8).map((q) => (
                <li key={q.question} className="flex items-center justify-between py-2 text-[14px]">
                  <span className="truncate pr-3 text-ink-700">{q.question}</span>
                  <span className="shrink-0 text-ink-400 tabular-nums">×{q.count}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-ink-400">
              If customers keep asking about something your page doesn&apos;t cover, consider adding it.
            </p>
          </Card>
        </section>
      )}
    </div>
  );
}
