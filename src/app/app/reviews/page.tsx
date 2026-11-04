import { requireMerchant } from '@/modules/auth/session-server';
import { can } from '@/modules/auth/rbac';
import { getReviewsEnabled, listReviews } from '@/modules/reviews';
import { EmptyState, PageHeader } from '@/components/ui';
import { ReviewRow } from './review-row';
import { ReviewsSwitch } from './reviews-switch';

export const metadata = { title: 'Customer reviews' };

export default async function ReviewsPage() {
  const { tenantId, principal } = await requireMerchant('reviews:read');
  const [reviews, enabled] = await Promise.all([listReviews(tenantId), getReviewsEnabled(tenantId)]);
  const canModerate = can(principal, 'reviews:moderate');
  const fmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const waiting = reviews.filter((r) => r.status === 'pending');
  const rest = reviews.filter((r) => r.status !== 'pending');
  const toRow = (r: (typeof reviews)[number]) => (
    <ReviewRow
      key={r.id}
      canModerate={canModerate}
      review={{
        id: r.id,
        rating: r.rating,
        authorName: r.authorName,
        comment: r.comment,
        reply: r.reply,
        status: r.status,
        createdAt: fmt.format(r.createdAt),
      }}
    />
  );

  return (
    <div>
      <PageHeader
        title="Customer reviews"
        description="Customers can leave a review from your page. Nothing shows until you approve it."
      />
      <ReviewsSwitch enabled={enabled} canChange={canModerate} />
      {reviews.length === 0 ? (
        <EmptyState title="No reviews yet" body="When a customer leaves one, it will appear here for you to approve." />
      ) : (
        <div className="space-y-6">
          {waiting.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-400">
                Waiting for you ({waiting.length})
              </h2>
              {waiting.map(toRow)}
            </section>
          )}
          {rest.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-400">Earlier</h2>
              {rest.map(toRow)}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
