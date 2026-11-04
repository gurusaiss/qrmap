/**
 * Customer reviews.
 *
 * Anyone with the page can submit one without an account, so every submission
 * lands as 'pending' and is invisible until the merchant approves it. The
 * tenant is resolved from the slug server-side; abuse is bounded by durable
 * per-visitor and per-shop rate limits.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withTenant, type Tx } from '../tenancy';
import { schema } from '../db/client';
import { env } from '../core/env';
import { hashIp } from '../auth/crypto';
import { enforceDurable } from '../auth/durable-rate-limit';
import { resolveSlug } from '../merchants/slugs';

export type ReviewStatus = 'pending' | 'approved' | 'hidden';

export const REVIEW_LIMITS = {
  perVisitorPerShop: { limit: 3, windowSeconds: 24 * 60 * 60 },
  perShop: { limit: 40, windowSeconds: 24 * 60 * 60 },
} as const;

export class ReviewError extends Error {
  override readonly name = 'ReviewError';
  constructor(
    readonly code: 'invalid' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}

const emptyToNull = (v: string | undefined): string | null => (v && v.length > 0 ? v : null);

const reviewInputSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Choose a rating from 1 to 5').max(5, 'Choose a rating from 1 to 5'),
  name: z.string().trim().max(60, 'Name is too long (60 characters max)').optional(),
  comment: z.string().trim().max(500, 'Review is too long (500 characters max)').optional(),
});

export type ReviewInput = { rating: unknown; name?: unknown; comment?: unknown };

export function parseReviewInput(input: ReviewInput): { rating: number; authorName: string | null; comment: string | null } {
  const parsed = reviewInputSchema.safeParse({
    rating: input.rating,
    name: typeof input.name === 'string' ? input.name : undefined,
    comment: typeof input.comment === 'string' ? input.comment : undefined,
  });
  if (!parsed.success) {
    throw new ReviewError('invalid', parsed.error.issues[0]?.message ?? 'Invalid review');
  }
  return {
    rating: parsed.data.rating,
    authorName: emptyToNull(parsed.data.name),
    comment: emptyToNull(parsed.data.comment),
  };
}

export async function submitReview(args: {
  slug: string;
  input: ReviewInput;
  ip: string;
}): Promise<{ id: string }> {
  const parsed = parseReviewInput(args.input);

  const resolution = await resolveSlug(args.slug);
  if (resolution.kind === 'unknown') throw new ReviewError('unavailable', 'This page was not found.');
  const tenantId = resolution.tenantId;

  const visitor = hashIp(env().ANALYTICS_SALT_SECRET, `${tenantId}|${args.ip}`);
  await enforceDurable(`review:v:${tenantId}:${visitor}`, REVIEW_LIMITS.perVisitorPerShop);
  await enforceDurable(`review:t:${tenantId}`, REVIEW_LIMITS.perShop);

  return withTenant(tenantId, async ({ tx }) => {
    const [tenant] = await tx
      .select({ status: schema.tenants.status, publishedAt: schema.tenants.publishedAt })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);
    if (!tenant || tenant.status !== 'active' || !tenant.publishedAt) {
      throw new ReviewError('unavailable', 'This page is not accepting reviews.');
    }
    const [profile] = await tx
      .select({ reviewsEnabled: schema.businessProfiles.reviewsEnabled })
      .from(schema.businessProfiles)
      .where(eq(schema.businessProfiles.tenantId, tenantId))
      .limit(1);
    if (profile && !profile.reviewsEnabled) {
      throw new ReviewError('unavailable', 'This page is not accepting reviews.');
    }
    const [row] = await tx
      .insert(schema.reviews)
      .values({ tenantId, ...parsed, visitorHash: visitor })
      .returning({ id: schema.reviews.id });
    return { id: row!.id };
  });
}

export type PublicReviews = {
  count: number;
  average: number | null;
  items: {
    id: string;
    rating: number;
    authorName: string | null;
    comment: string | null;
    reply: string | null;
    createdAt: Date;
  }[];
};

/** Approved reviews only - the one query the public page may use. */
export async function loadPublicReviews(tx: Tx, tenantId: string, limit = 5): Promise<PublicReviews> {
  const approved = and(eq(schema.reviews.tenantId, tenantId), eq(schema.reviews.status, 'approved'));
  const [agg] = await tx
    .select({
      count: sql<number>`count(*)::int`,
      average: sql<string | null>`round(avg(${schema.reviews.rating})::numeric, 1)::text`,
    })
    .from(schema.reviews)
    .where(approved);
  const items = await tx
    .select({
      id: schema.reviews.id,
      rating: schema.reviews.rating,
      authorName: schema.reviews.authorName,
      comment: schema.reviews.comment,
      reply: schema.reviews.reply,
      createdAt: schema.reviews.createdAt,
    })
    .from(schema.reviews)
    .where(approved)
    .orderBy(desc(schema.reviews.createdAt))
    .limit(limit);
  return { count: agg?.count ?? 0, average: agg?.average != null ? Number(agg.average) : null, items };
}

export async function listReviews(tenantId: string, status?: ReviewStatus) {
  return withTenant(tenantId, ({ tx }) =>
    tx
      .select()
      .from(schema.reviews)
      .where(
        status
          ? and(eq(schema.reviews.tenantId, tenantId), eq(schema.reviews.status, status))
          : eq(schema.reviews.tenantId, tenantId),
      )
      .orderBy(desc(schema.reviews.createdAt))
      .limit(200),
  );
}

export async function setReviewStatus(tenantId: string, reviewId: string, status: ReviewStatus): Promise<boolean> {
  return withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .update(schema.reviews)
      .set({ status })
      .where(and(eq(schema.reviews.id, reviewId), eq(schema.reviews.tenantId, tenantId)))
      .returning({ id: schema.reviews.id });
    return row !== undefined;
  });
}

export const MAX_REPLY_LENGTH = 500;

/** Sets, edits or (with blank text) removes the merchant's reply. False if the review is not theirs. */
export async function setReviewReply(tenantId: string, reviewId: string, text: string): Promise<boolean> {
  const reply = text.trim();
  if (reply.length > MAX_REPLY_LENGTH) {
    throw new ReviewError('invalid', `Reply is too long (${MAX_REPLY_LENGTH} characters max)`);
  }
  return withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .update(schema.reviews)
      .set(reply === '' ? { reply: null, repliedAt: null } : { reply, repliedAt: new Date() })
      .where(and(eq(schema.reviews.id, reviewId), eq(schema.reviews.tenantId, tenantId)))
      .returning({ id: schema.reviews.id });
    return row !== undefined;
  });
}

export async function getReviewsEnabled(tenantId: string): Promise<boolean> {
  return withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .select({ on: schema.businessProfiles.reviewsEnabled })
      .from(schema.businessProfiles)
      .where(eq(schema.businessProfiles.tenantId, tenantId))
      .limit(1);
    return row?.on ?? true;
  });
}

export async function setReviewsEnabled(tenantId: string, enabled: boolean): Promise<void> {
  await withTenant(tenantId, async ({ tx }) => {
    await tx
      .update(schema.businessProfiles)
      .set({ reviewsEnabled: enabled })
      .where(eq(schema.businessProfiles.tenantId, tenantId));
  });
}

export async function pendingReviewCount(tenantId: string): Promise<number> {
  return withTenant(tenantId, async ({ tx }) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.reviews)
      .where(and(eq(schema.reviews.tenantId, tenantId), eq(schema.reviews.status, 'pending')));
    return row?.n ?? 0;
  });
}
