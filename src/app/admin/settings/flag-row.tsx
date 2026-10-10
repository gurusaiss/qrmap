'use client';

import { useTransition } from 'react';
import { toggleFeatureFlagAction } from './actions';

type Flag = { key: string; description: string; defaultEnabled: boolean };

export function FlagRow({ flag }: { flag: Flag }) {
  const [pending, start] = useTransition();

  return (
    <tr className="border-b border-ink-100 last:border-0">
      <td className="px-4 py-3">
        <p className="font-mono text-[13px] font-medium">{flag.key}</p>
        <p className="text-[13px] text-ink-500">{flag.description}</p>
      </td>
      <td className="px-4 py-3 text-right">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={flag.defaultEnabled}
            disabled={pending}
            onChange={(e) => start(() => void toggleFeatureFlagAction(flag.key, e.target.checked))}
          />
          <span className="text-[13px] text-ink-500">{flag.defaultEnabled ? 'Enabled' : 'Disabled'}</span>
        </label>
      </td>
    </tr>
  );
}
