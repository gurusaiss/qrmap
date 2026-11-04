import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { withSystem, withTenant } from '../../tenancy';
import { appDb, closeDb, schema } from '../../db/client';
import { createTenant } from '../../merchants/tenants';
import { RateLimitError } from '../../auth/rate-limit';
import {
  listReviews,
  getReviewsEnabled,
  loadPublicReviews,
  parseReviewInput,
  pendingReviewCount,
  ReviewError,
  MAX_REPLY_LENGTH,
  setReviewReply,
  setReviewsEnabled,
  setReviewStatus,
  submitReview,
} from '..';

const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000f5';
const CATEGORY_SLUG = 'reviews-spec-category';

let categoryId = '';

async function newShop(opts: { published?: boolean } = {}): Promise<{ tenantId: string; slug: string }> {
  const slug = `rv-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const { tenantId } = await createTenant({
    displayName: `Reviews Spec Shop ${randomUUID()}`,
    categoryId,
    slug,
    owner: { method: 'email', email: `${slug}@example.com`, password: 'correct-horse-battery-staple' },
    actorUserId: ACTOR_USER_ID,
  });
  if (opts.published ?? true) {
    await withSystem(({ tx }) =>
      tx.update(schema.tenants).set({ publishedAt: new Date(), status: 'active' }).where(eq(schema.tenants.id, tenantId)),
    );
  }
  return { tenantId, slug };
}

const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

beforeAll(async () => {
  const [row] = await withSystem(({ tx }) =>
    tx.execute(
      sql`INSERT INTO categories (slug, name) VALUES (${CATEGORY_SLUG}, 'Reviews spec category')
          ON CONFLICT (slug) DO UPDATE SET name = excluded.name RETURNING id`,
    ),
  );
  categoryId = (row as { id: string }).id;
});

// Tenants (and so this category) are never deleted - left behind by design.
afterAll(async () => {
  await closeDb();
});

describe('parseReviewInput', () => {
  it('accepts a rating alone and normalises blank text to null', () => {
    expect(parseReviewInput({ rating: '4', name: '  ', comment: '' })).toEqual({
      rating: 4,
      authorName: null,
      comment: null,
    });
  });

  it('trims text and keeps it', () => {
    expect(parseReviewInput({ rating: 5, name: ' Asha ', comment: ' Great ' })).toEqual({
      rating: 5,
      authorName: 'Asha',
      comment: 'Great',
    });
  });

  it.each([0, 6, 3.5, 'abc', undefined, null])('rejects rating %s', (rating) => {
    expect(() => parseReviewInput({ rating })).toThrow(ReviewError);
  });

  it('rejects over-long text', () => {
    expect(() => parseReviewInput({ rating: 3, comment: 'x'.repeat(501) })).toThrow(/too long/);
    expect(() => parseReviewInput({ rating: 3, name: 'x'.repeat(61) })).toThrow(/too long/);
  });
});

describe('submitReview', () => {
  it('stores a pending review that the public cannot see until approved', async () => {
    const { tenantId, slug } = await newShop();
    const { id } = await submitReview({ slug, ip: ip(), input: { rating: 5, name: 'Asha', comment: 'Lovely' } });

    expect(await pendingReviewCount(tenantId)).toBe(1);
    const before = await withTenant(tenantId, ({ tx }) => loadPublicReviews(tx, tenantId));
    expect(before).toEqual({ count: 0, average: null, items: [] });

    expect(await setReviewStatus(tenantId, id, 'approved')).toBe(true);
    const after = await withTenant(tenantId, ({ tx }) => loadPublicReviews(tx, tenantId));
    expect(after.count).toBe(1);
    expect(after.average).toBe(5);
    expect(after.items[0]).toMatchObject({ id, rating: 5, authorName: 'Asha', comment: 'Lovely' });
    expect(await pendingReviewCount(tenantId)).toBe(0);
  });

  it('averages approved reviews only and drops hidden ones', async () => {
    const { tenantId, slug } = await newShop();
    const a = await submitReview({ slug, ip: ip(), input: { rating: 5 } });
    const b = await submitReview({ slug, ip: ip(), input: { rating: 4 } });
    const c = await submitReview({ slug, ip: ip(), input: { rating: 1 } });
    await setReviewStatus(tenantId, a.id, 'approved');
    await setReviewStatus(tenantId, b.id, 'approved');
    await setReviewStatus(tenantId, c.id, 'hidden');

    const pub = await withTenant(tenantId, ({ tx }) => loadPublicReviews(tx, tenantId));
    expect(pub.count).toBe(2);
    expect(pub.average).toBe(4.5);

    await setReviewStatus(tenantId, a.id, 'hidden');
    const pub2 = await withTenant(tenantId, ({ tx }) => loadPublicReviews(tx, tenantId));
    expect(pub2.count).toBe(1);
  });

  it('refuses unknown slugs and unpublished shops', async () => {
    await expect(submitReview({ slug: 'no-such-shop-xyz', ip: ip(), input: { rating: 5 } })).rejects.toMatchObject({
      code: 'unavailable',
    });
    const { slug } = await newShop({ published: false });
    await expect(submitReview({ slug, ip: ip(), input: { rating: 5 } })).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('limits one visitor to 3 reviews per shop per day, but not other visitors', async () => {
    const { slug } = await newShop();
    const visitor = ip();
    for (let i = 0; i < 3; i++) await submitReview({ slug, ip: visitor, input: { rating: 4 } });
    await expect(submitReview({ slug, ip: visitor, input: { rating: 4 } })).rejects.toBeInstanceOf(RateLimitError);
    await expect(submitReview({ slug, ip: ip(), input: { rating: 4 } })).resolves.toBeTruthy();
  });

  it('does not spend rate limit on invalid input', async () => {
    const { slug } = await newShop();
    const visitor = ip();
    for (let i = 0; i < 5; i++) {
      await expect(submitReview({ slug, ip: visitor, input: { rating: 9 } })).rejects.toBeInstanceOf(ReviewError);
    }
    await expect(submitReview({ slug, ip: visitor, input: { rating: 5 } })).resolves.toBeTruthy();
  });
});

describe('merchant replies', () => {
  it('a reply is stored, trimmed, and shown publicly only once the review is approved', async () => {
    const { tenantId, slug } = await newShop();
    const { id } = await submitReview({ slug, ip: ip(), input: { rating: 3, comment: 'Slow service' } });

    expect(await setReviewReply(tenantId, id, '  Sorry about that - we have added staff.  ')).toBe(true);
    const [row] = await listReviews(tenantId);
    expect(row).toMatchObject({ reply: 'Sorry about that - we have added staff.', status: 'pending' });
    expect(row?.repliedAt).toBeInstanceOf(Date);

    const hidden = await withTenant(tenantId, ({ tx }) => loadPublicReviews(tx, tenantId));
    expect(hidden.items).toEqual([]);

    await setReviewStatus(tenantId, id, 'approved');
    const shown = await withTenant(tenantId, ({ tx }) => loadPublicReviews(tx, tenantId));
    expect(shown.items[0]?.reply).toBe('Sorry about that - we have added staff.');

    await setReviewStatus(tenantId, id, 'hidden');
    const gone = await withTenant(tenantId, ({ tx }) => loadPublicReviews(tx, tenantId));
    expect(gone.items).toEqual([]);
  });

  it('editing replaces the reply and blank text removes it', async () => {
    const { tenantId, slug } = await newShop();
    const { id } = await submitReview({ slug, ip: ip(), input: { rating: 5 } });
    await setReviewReply(tenantId, id, 'Thank you!');
    await setReviewReply(tenantId, id, 'Thank you, see you soon!');
    expect((await listReviews(tenantId))[0]?.reply).toBe('Thank you, see you soon!');

    await setReviewReply(tenantId, id, '   ');
    expect((await listReviews(tenantId))[0]).toMatchObject({ reply: null, repliedAt: null });
  });

  it('refuses an over-long reply and the database enforces the same cap', async () => {
    const { tenantId, slug } = await newShop();
    const { id } = await submitReview({ slug, ip: ip(), input: { rating: 5 } });
    await expect(setReviewReply(tenantId, id, 'x'.repeat(MAX_REPLY_LENGTH + 1))).rejects.toThrow(/too long/);
    await expect(
      withSystem(({ tx }) =>
        tx.update(schema.reviews).set({ reply: 'x'.repeat(MAX_REPLY_LENGTH + 1) }).where(eq(schema.reviews.id, id)),
      ),
    ).rejects.toThrow();
  });

  it("one shop cannot reply to another shop's review", async () => {
    const a = await newShop();
    const b = await newShop();
    const { id } = await submitReview({ slug: a.slug, ip: ip(), input: { rating: 1 } });
    expect(await setReviewReply(b.tenantId, id, 'Hijacked')).toBe(false);
    expect((await listReviews(a.tenantId))[0]?.reply).toBeNull();
  });
});

describe('reviews on/off switch', () => {
  async function shopWithProfile() {
    const shop = await newShop();
    await withSystem(({ tx }) =>
      tx.insert(schema.businessProfiles).values({ tenantId: shop.tenantId }).onConflictDoNothing(),
    );
    return shop;
  }

  it('is on by default, and turning it off refuses new reviews while keeping old ones', async () => {
    const { tenantId, slug } = await shopWithProfile();
    expect(await getReviewsEnabled(tenantId)).toBe(true);
    const { id } = await submitReview({ slug, ip: ip(), input: { rating: 5 } });

    await setReviewsEnabled(tenantId, false);
    expect(await getReviewsEnabled(tenantId)).toBe(false);
    await expect(submitReview({ slug, ip: ip(), input: { rating: 4 } })).rejects.toMatchObject({ code: 'unavailable' });
    expect((await listReviews(tenantId)).map((r) => r.id)).toEqual([id]);

    await setReviewsEnabled(tenantId, true);
    await expect(submitReview({ slug, ip: ip(), input: { rating: 4 } })).resolves.toBeTruthy();
  });

  it("one shop's switch does not affect another", async () => {
    const a = await shopWithProfile();
    const b = await shopWithProfile();
    await setReviewsEnabled(a.tenantId, false);
    expect(await getReviewsEnabled(b.tenantId)).toBe(true);
  });
});

describe('tenant isolation', () => {
  it("one shop cannot list, count or moderate another shop's reviews", async () => {
    const a = await newShop();
    const b = await newShop();
    const { id } = await submitReview({ slug: a.slug, ip: ip(), input: { rating: 2, comment: 'secret-a' } });

    expect(await listReviews(b.tenantId)).toEqual([]);
    expect(await pendingReviewCount(b.tenantId)).toBe(0);
    expect(await setReviewStatus(b.tenantId, id, 'approved')).toBe(false);

    const [row] = await listReviews(a.tenantId);
    expect(row?.status).toBe('pending');
  });

  it('RLS stops the app role from reading reviews with no tenant scope', async () => {
    const { slug } = await newShop();
    await submitReview({ slug, ip: ip(), input: { rating: 3 } });
    const rows = await appDb().select().from(schema.reviews);
    expect(rows).toEqual([]);
  });

  it('the database rejects a rating outside 1-5 even if app validation were bypassed', async () => {
    const { tenantId } = await newShop();
    await expect(
      withSystem(({ tx }) =>
        tx.insert(schema.reviews).values({ tenantId, rating: 7, visitorHash: 'x' }),
      ),
    ).rejects.toThrow();
  });
});
