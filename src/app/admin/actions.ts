'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePlatform, describeAuthError } from '@/modules/auth/session-server';
import { createTenant, setTenantStatus } from '@/modules/merchants/tenants';
import { changeSlug } from '@/modules/merchants/slugs';
import { setTenantFeatureBlock } from '@/modules/platform/features';
import { recordDomainChange } from '@/modules/platform/settings';

export type FormState = { error?: string; success?: string };

export async function createTenantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requirePlatform('platform:tenant:create');

  const displayName = String(formData.get('displayName') ?? '').trim();
  const categoryId = String(formData.get('categoryId') ?? '');
  const phone = String(formData.get('phone') ?? '').trim() || null;
  const city = String(formData.get('city') ?? '').trim() || null;
  const ownerPhone = String(formData.get('ownerPhone') ?? '').trim() || null;
  const slug = String(formData.get('slug') ?? '').trim() || undefined;

  if (!displayName || !categoryId) return { error: 'Business name and category are required.' };

  let result;
  try {
    result = await createTenant({
      displayName,
      categoryId,
      phone,
      city,
      ownerPhone,
      slug,
      actorUserId: session.userId,
    });
  } catch (error) {
    return { error: describeAuthError(error) };
  }

  redirect(`/admin/merchants/${result.tenantId}`);
}

export async function suspendTenantAction(tenantId: string, reason: string): Promise<void> {
  const { session } = await requirePlatform('platform:tenant:suspend');
  await setTenantStatus({ tenantId, status: 'suspended', actorUserId: session.userId, reason });
  revalidatePath(`/admin/merchants/${tenantId}`);
  revalidatePath('/admin');
}

export async function activateTenantAction(tenantId: string): Promise<void> {
  const { session } = await requirePlatform('platform:tenant:update');
  await setTenantStatus({ tenantId, status: 'active', actorUserId: session.userId });
  revalidatePath(`/admin/merchants/${tenantId}`);
  revalidatePath('/admin');
}

/**
 * Deletion is a status change, never a row deletion (see docs/03 §E — a slug
 * or tenant id is never freed for reuse).
 */
export async function deleteTenantAction(tenantId: string, confirmedName: string): Promise<FormState> {
  const { session } = await requirePlatform('platform:tenant:delete');
  await setTenantStatus({
    tenantId,
    status: 'deleted',
    actorUserId: session.userId,
    reason: `confirmed via typed name: ${confirmedName}`,
  });
  revalidatePath('/admin');
  redirect('/admin');
}

/**
 * Renaming the slug mints a NEW primary slug; the old one becomes a permanent
 * alias. This is the only supported way to change a merchant's address.
 */
export async function changeSlugAction(tenantId: string, newSlug: string): Promise<FormState> {
  const { session } = await requirePlatform('platform:slug:change');
  try {
    await changeSlug({ tenantId, newSlug, actorUserId: session.userId });
  } catch (error) {
    return { error: describeAuthError(error) };
  }
  revalidatePath(`/admin/merchants/${tenantId}`);
  return { success: `Address changed to /m/${newSlug}. The old address still works and redirects here.` };
}

/** Blocks (or lifts a block on) one feature for one merchant - never forces a feature on. */
export async function setTenantFeatureBlockAction(tenantId: string, flagKey: string, blocked: boolean): Promise<void> {
  const { session } = await requirePlatform('platform:flags:write');
  await setTenantFeatureBlock(tenantId, flagKey, blocked, session.userId);
  revalidatePath(`/admin/merchants/${tenantId}`);
}

/** Flags every merchant as needing to reprint their QR code against the new domain. */
export async function recordDomainChangeAction(): Promise<void> {
  const { session } = await requirePlatform('platform:flags:write');
  await recordDomainChange(session.userId);
  revalidatePath('/admin/settings');
}
