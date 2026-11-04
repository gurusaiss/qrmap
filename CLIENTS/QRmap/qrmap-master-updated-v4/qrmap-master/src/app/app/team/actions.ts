'use server';

import { revalidatePath } from 'next/cache';
import { requireMerchant, describeAuthError } from '@/modules/auth/session-server';
import { addMember, changeMemberRole, removeMember } from '@/modules/merchants/members';
import type { MerchantRole } from '@/modules/auth/rbac';

export type FormState = { error?: string; success?: string };

function asRole(value: FormDataEntryValue | null): MerchantRole {
  const role = String(value ?? 'staff');
  return role === 'owner' || role === 'manager' ? role : 'staff';
}

export async function addMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { tenantId, principal } = await requireMerchant('members:write');
    await addMember({
      tenantId,
      actor: principal,
      phone: String(formData.get('phone') ?? ''),
      fullName: String(formData.get('fullName') ?? '').trim() || null,
      role: asRole(formData.get('role')),
    });
    revalidatePath('/app/team');
    return { success: 'Added. They can now sign in with that mobile number.' };
  } catch (error) {
    return { error: describeAuthError(error) };
  }
}

export async function changeRoleAction(membershipId: string, role: MerchantRole): Promise<FormState> {
  try {
    const { tenantId, principal } = await requireMerchant('members:write');
    await changeMemberRole({ tenantId, actor: principal, membershipId, role });
    revalidatePath('/app/team');
    return { success: 'Role updated.' };
  } catch (error) {
    return { error: describeAuthError(error) };
  }
}

export async function removeMemberAction(membershipId: string): Promise<FormState> {
  try {
    const { tenantId, principal } = await requireMerchant('members:write');
    await removeMember({ tenantId, actor: principal, membershipId });
    revalidatePath('/app/team');
    return { success: 'Removed.' };
  } catch (error) {
    return { error: describeAuthError(error) };
  }
}
