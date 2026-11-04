'use client';

import { useTransition } from 'react';
import { toggleCategoryAiAction } from './actions';

type Category = { id: string; name: string; templateKey: string; aiEnabledByDefault: boolean };

export function CategoryRow({ category }: { category: Category }) {
  const [pending, start] = useTransition();

  return (
    <tr className="border-b border-ink-100 last:border-0">
      <td className="px-4 py-2 font-medium">{category.name}</td>
      <td className="px-4 py-2 text-ink-500">{category.templateKey}</td>
      <td className="px-4 py-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={category.aiEnabledByDefault}
            disabled={pending}
            onChange={(e) => start(() => void toggleCategoryAiAction(category.id, e.target.checked))}
          />
          <span className="text-[13px] text-ink-500">{category.aiEnabledByDefault ? 'On' : 'Off'}</span>
        </label>
      </td>
    </tr>
  );
}
