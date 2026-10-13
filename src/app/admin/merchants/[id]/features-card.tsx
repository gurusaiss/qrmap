'use client';

import { useTransition } from 'react';
import { Badge, Card } from '@/components/ui';
import { setTenantFeatureBlockAction } from '../../actions';

export type FlagRow = { key: string; description: string; defaultEnabled: boolean };
export type OverrideRow = { flagKey: string; enabled: boolean };

/**
 * A block here only ever restricts - it can never force a feature on for a
 * merchant who has it off themselves. See src/modules/platform/features.ts.
 */
export function FeaturesCard({
  tenantId,
  flags,
  overrides,
}: {
  tenantId: string;
  flags: FlagRow[];
  overrides: OverrideRow[];
}) {
  const [pending, start] = useTransition();
  const blockedKeys = new Set(overrides.filter((o) => !o.enabled).map((o) => o.flagKey));

  return (
    <Card className="mb-6">
      <h2 className="mb-1 font-semibold">Features</h2>
      <p className="mb-3 text-[13px] text-ink-500">
        Block a feature to turn it off for this business specifically, regardless of what they&apos;ve
        set themselves or the platform default. Unblocking returns it to normal.
      </p>
      <ul className="divide-y divide-ink-100">
        {flags.map((flag) => {
          const blocked = blockedKeys.has(flag.key);
          return (
            <li key={flag.key} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
              <div className="min-w-0">
                <p className="font-medium">{flag.description || flag.key}</p>
                <p className="text-[12px] text-ink-400">
                  Platform default: {flag.defaultEnabled ? 'on' : 'off'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {blocked && <Badge tone="danger">Blocked</Badge>}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(() => setTenantFeatureBlockAction(tenantId, flag.key, !blocked))
                  }
                  className={`tap-target rounded-[var(--radius-sm)] px-3 text-[13px] font-medium transition-colors ${
                    blocked
                      ? 'border border-ink-200 text-ink-700 hover:bg-ink-100'
                      : 'bg-danger-50 text-danger-600 hover:bg-danger-50/70'
                  }`}
                >
                  {blocked ? 'Unblock' : 'Block'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
