'use server';

import { revalidatePath } from 'next/cache';
import { requireMerchant } from '@/modules/auth/session-server';
import { primarySlugFor } from '@/modules/merchants/slugs';
import { ReviewError, setReviewReply, setReviewStatus, setReviewsEnabled, type ReviewStatus } from '@/modules/reviews';

const STATUSES: readonly ReviewStatus[] = ['pending', 'approved', 'hidden'];

export async function moderateReviewAction(reviewId: string, status: ReviewStatus): Promise<void> {
  const { tenantId } = await requireMerchant('reviews:moderate');
  if (!STATUSES.includes(status)) return;
  await setReviewStatus(tenantId, reviewId, status);
  const slug = await primarySlugFor(tenantId);
  revalidatePath('/app/reviews');
  revalidatePath('/app');
  if (slug) revalidatePath(`/m/${slug}`);
}

export async function setReviewsEnabledAction(enabled: boolean): Promise<void> {
  const { tenantId } = await requireMerchant('reviews:moderate');
  await setReviewsEnabled(tenantId, enabled);
  const slug = await primarySlugFor(tenantId);
  revalidatePath('/app/reviews');
  if (slug) revalidatePath(`/m/${slug}`);
}

export async function replyToReviewAction(reviewId: string, text: string): Promise<{ error?: string }> {
  const { tenantId } = await requireMerchant('reviews:moderate');
  try {
    await setReviewReply(tenantId, reviewId, text);
  } catch (error) {
    if (error instanceof ReviewError) return { error: error.message };
    throw error;
  }
  const slug = await primarySlugFor(tenantId);
  revalidatePath('/app/reviews');
  if (slug) revalidatePath(`/m/${slug}`);
  return {};
}
