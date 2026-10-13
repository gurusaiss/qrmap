/**
 * Audit trail. Append-only: the app role has INSERT but no UPDATE or DELETE
 * grant, and a trigger raises on either.
 *
 * Mandatory for anything touching merchant identity, roles, slugs, plan state,
 * suspension, QR re-pointing, impersonation and deletion.
 */
import { withSystem } from '../tenancy';
import { schema } from '../db/client';

export type AuditAction =
  | 'tenant.create' | 'tenant.update' | 'tenant.suspend' | 'tenant.activate'
  | 'tenant.delete' | 'tenant.publish' | 'tenant.unpublish'
  | 'slug.create' | 'slug.change'
  | 'qr.repoint' | 'qr.download'
  | 'member.add' | 'member.role_change' | 'member.remove'
  | 'plan.change'
  | 'admin.impersonate.start' | 'admin.impersonate.end'
  | 'security.client_tenant_id_ignored'
  | 'security.pin_rejected'
  | 'ai.config_change';

export type AuditEntry = {
  action: AuditAction;
  actorUserId?: string | null;
  actorType?: 'merchant' | 'platform' | 'system' | 'anon';
  tenantId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ipHash?: string | null;
};

export async function recordAudit(entry: AuditEntry): Promise<void> {
  await withSystem(({ tx }) =>
    tx.insert(schema.auditLogs).values({
      action: entry.action,
      actorUserId: entry.actorUserId ?? null,
      actorType: entry.actorType ?? 'system',
      tenantId: entry.tenantId ?? null,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      before: (entry.before ?? null) as never,
      after: (entry.after ?? null) as never,
      ipHash: entry.ipHash ?? null,
    }),
  );
}

/**
 * Audit failures must never break the user's action, but must be visible.
 * A dropped audit line is an incident, not a silent no-op.
 */
export async function recordAuditSafe(entry: AuditEntry): Promise<void> {
  try {
    await recordAudit(entry);
  } catch (error) {
    process.stderr.write(
      `AUDIT WRITE FAILED action=${entry.action} tenant=${entry.tenantId ?? '-'} error=${String(error)}\n`,
    );
  }
}
