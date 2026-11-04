'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { requireMerchant } from '@/modules/auth/session-server';
import { withTenant } from '@/modules/tenancy';
import { schema } from '@/modules/db/client';

export async function setMonthlyReportAction(enabled: boolean): Promise<void> {
  const { tenantId } = await requireMerchant('profile:write');
  await withTenant(tenantId, async ({ tx }) => {
    await tx
      .update(schema.businessProfiles)
      .set({ monthlyReportWhatsapp: enabled })
      .where(eq(schema.businessProfiles.tenantId, tenantId));
  });
  revalidatePath('/app/account');
}
