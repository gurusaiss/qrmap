'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePlatform, describeAuthError } from '@/modules/auth/session-server';
import { setSessionCookie } from '@/modules/auth/session-server';
import { startImpersonation } from '@/modules/auth/service';
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
  const slug = String(formData.get('slug') ?? '').trim() || undefined;
  const ownerFullName = String(formData.get('ownerFullName') ?? '').trim() || null;
  const loginMethod = formData.get('loginMethod') === 'phone' ? 'phone' : 'email';

  if (!displayName || !categoryId) return { error: 'Business name and category are required.' };

  const owner =
    loginMethod === 'phone'
      ? ({
          method: 'phone' as const,
          phone: String(formData.get('ownerPhone') ?? '').trim(),
          pin: String(formData.get('ownerPin') ?? '').trim(),
        })
      : ({
          method: 'email' as const,
          email: String(formData.get('ownerEmail') ?? '').trim(),
          password: String(formData.get('ownerPassword') ?? ''),
        });

  if (owner.method === 'phone' && (!owner.phone || !owner.pin)) {
    return { error: "Enter the owner's mobile number and a 6-digit PIN." };
  }
  if (owner.method === 'email' && (!owner.email || !owner.password)) {
    return { error: "Enter the owner's email and a password." };
  }

  let result;
  try {
    result = await createTenant({
      displayName,
      categoryId,
      phone,
      city,
      slug,
      owner,
      ownerFullName,
      actorUserId: session.userId,
    });
  } catch (error) {
    return { error: describeAuthError(error) };
  }

  const identifier = result.ownerLogin.method === 'email' ? result.ownerLogin.email : result.ownerLogin.phone;
  const params = new URLSearchParams({ created: result.ownerLogin.method, identifier });
  redirect(`/admin/merchants/${result.tenantId}?${params.toString()}`);
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

/**
 * Signs the admin into this merchant's own dashboard, as that merchant's
 * owner. Currently the only way into a merchant dashboard besides the
 * merchant themselves, since phone+OTP login is hidden until SMS is
 * configured and merchants have no password to sign in with otherwise.
 */
export async function impersonateTenantAction(tenantId: string): Promise<FormState> {
  const { session } = await requirePlatform('platform:impersonate');
  const h = await headers();
  let token: string;
  try {
    ({ token } = await startImpersonation({
      tenantId,
      actorAdminUserId: session.userId,
      context: {
        ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0',
        userAgent: h.get('user-agent') ?? '',
      },
    }));
  } catch (error) {
    return { error: describeAuthError(error) };
  }
  await setSessionCookie(token);
  redirect('/app');
}
