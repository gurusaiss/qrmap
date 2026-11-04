'use server';

import { revalidatePath } from 'next/cache';
import { requirePlatform, describeAuthError } from '@/modules/auth/session-server';
import { createCategory, setFeatureFlag, updateCategory, updatePlan } from '@/modules/platform/settings';
import { slugifyBusinessName } from '@/modules/core/slug';

export type FormState = { error?: string; success?: string };

export async function createCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { session } = await requirePlatform('platform:categories:write');
    const name = String(formData.get('name') ?? '').trim();
    if (!name) return { error: 'Name is required.' };
    await createCategory(
      {
        slug: slugifyBusinessName(name),
        name,
        templateKey: String(formData.get('templateKey') ?? 'generic'),
        aiEnabledByDefault: formData.get('aiEnabledByDefault') === 'on',
        sortOrder: 999,
      },
      session.userId,
    );
    revalidatePath('/admin/settings');
    return { success: `Added category "${name}".` };
  } catch (error) {
    return { error: describeAuthError(error) };
  }
}

export async function toggleCategoryAiAction(categoryId: string, aiEnabledByDefault: boolean): Promise<void> {
  const { session } = await requirePlatform('platform:categories:write');
  await updateCategory(categoryId, { aiEnabledByDefault }, session.userId);
  revalidatePath('/admin/settings');
}

export async function updatePlanPriceAction(planId: string, priceMinor: number): Promise<void> {
  const { session } = await requirePlatform('platform:plans:write');
  await updatePlan(planId, { priceMinor }, session.userId);
  revalidatePath('/admin/settings');
}

export async function togglePlanPublicAction(planId: string, isPublic: boolean): Promise<void> {
  const { session } = await requirePlatform('platform:plans:write');
  await updatePlan(planId, { isPublic }, session.userId);
  revalidatePath('/admin/settings');
}

export async function toggleFeatureFlagAction(key: string, defaultEnabled: boolean): Promise<void> {
  const { session } = await requirePlatform('platform:flags:write');
  await setFeatureFlag(key, defaultEnabled, session.userId);
  revalidatePath('/admin/settings');
}
