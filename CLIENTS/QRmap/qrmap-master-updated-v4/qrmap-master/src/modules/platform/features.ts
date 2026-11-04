/**
 * Per-tenant feature overrides - an admin-only restriction mechanism.
 *
 * A tenant_feature_overrides row only ever BLOCKS a feature; it never
 * force-enables one a merchant has turned off themselves. Absence of a row
 * means "use whatever the merchant/platform default already decides" - this
 * is purely a kill switch, never a way to turn something on against the
 * merchant's own choice. RLS backs this up independently: mdp_app (the
 * merchant-facing role) only ever gets SELECT on this table, never write
 * (see src/modules/db/sql/10-rls.sql) - a bug here can't let a merchant
 * undo their own restriction even if this file got it wrong.
 */
import { and, eq } from 'drizzle-orm';
import { withSystem, withTenant } from '../tenancy';
import { schema } from '../db/client';
import { recordAudit } from '../core/audit';

export type TenantFeatureOverride = { flagKey: string; enabled: boolean };

export async function getTenantFeatureOverrides(tenantId: string): Promise<TenantFeatureOverride[]> {
  return withSystem(({ tx }) =>
    tx
      .select({ flagKey: schema.tenantFeatureOverrides.flagKey, enabled: schema.tenantFeatureOverrides.enabled })
      .from(schema.tenantFeatureOverrides)
      .where(eq(schema.tenantFeatureOverrides.tenantId, tenantId)),
  );
}

/** Blocks (or lifts a block on) one feature for one tenant. Admin-only caller. */
export async function setTenantFeatureBlock(
  tenantId: string,
  flagKey: string,
  blocked: boolean,
  actorUserId: string,
): Promise<void> {
  await withSystem(({ tx }) => {
    if (blocked) {
      return tx
        .insert(schema.tenantFeatureOverrides)
        .values({ tenantId, flagKey, enabled: false })
        .onConflictDoUpdate({
          target: [schema.tenantFeatureOverrides.tenantId, schema.tenantFeatureOverrides.flagKey],
          set: { enabled: false },
        });
    }
    return tx
      .delete(schema.tenantFeatureOverrides)
      .where(
        and(
          eq(schema.tenantFeatureOverrides.tenantId, tenantId),
          eq(schema.tenantFeatureOverrides.flagKey, flagKey),
        ),
      );
  });
  await recordAudit({
    action: 'tenant.feature_override_change',
    actorUserId,
    actorType: 'platform',
    tenantId,
    entityType: 'feature_flag',
    entityId: flagKey,
    after: { blocked },
  });
}

/**
 * The actual gate. `ownSetting` is whatever the merchant (or a category
 * default) already decided; a block only ever pulls that down to false, it
 * never raises it to true. `platformEnabled` is the feature_flags row for
 * this key (Platform settings → Feature flags) - a platform-wide kill
 * switch underneath the per-tenant one; defaults to true so every existing
 * caller that doesn't pass it is unaffected.
 */
export function effectiveFeatureEnabled(
  ownSetting: boolean,
  override: TenantFeatureOverride | undefined,
  platformEnabled = true,
): boolean {
  return platformEnabled && ownSetting && override?.enabled !== false;
}

/** Convenience check for a single flag, reading through the tenant connection. */
export async function isFeatureBlockedForTenant(tenantId: string, flagKey: string): Promise<boolean> {
  const [row] = await withTenant(tenantId, ({ tx }) =>
    tx
      .select({ enabled: schema.tenantFeatureOverrides.enabled })
      .from(schema.tenantFeatureOverrides)
      .where(
        and(
          eq(schema.tenantFeatureOverrides.tenantId, tenantId),
          eq(schema.tenantFeatureOverrides.flagKey, flagKey),
        ),
      )
      .limit(1),
  );
  return row?.enabled === false;
}
