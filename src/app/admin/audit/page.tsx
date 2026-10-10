import { requirePlatform } from '@/modules/auth/session-server';
import { listAuditLog } from '@/modules/platform/settings';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';

export const metadata = { title: 'Audit log' };

const DANGER_ACTIONS = new Set([
  'tenant.delete',
  'tenant.suspend',
  'slug.change',
  'qr.repoint',
  'admin.impersonate.start',
  'security.totp_rejected',
  'security.client_tenant_id_ignored',
]);

export default async function AuditLogPage() {
  await requirePlatform('platform:audit:read');
  const entries = await listAuditLog({ limit: 200 });

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every change to merchant identity, roles, slugs, plans, suspension and admin access — append-only, newest first."
      />

      {entries.length === 0 ? (
        <EmptyState title="Nothing logged yet" body="Actions appear here as soon as they happen." />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-left text-[14px]">
            <thead className="border-b border-ink-100 bg-ink-50 text-ink-500">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Entity</th>
                <th className="px-4 py-2 font-medium">Actor</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-ink-100 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 text-ink-500">
                    {entry.createdAt.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={DANGER_ACTIONS.has(entry.action) ? 'danger' : 'neutral'}>{entry.action}</Badge>
                  </td>
                  <td className="px-4 py-2 font-mono text-[13px] text-ink-500">
                    {entry.entityType ? `${entry.entityType}:${entry.entityId?.slice(0, 8) ?? ''}` : '—'}
                  </td>
                  <td className="px-4 py-2 text-ink-500">{entry.actorType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
