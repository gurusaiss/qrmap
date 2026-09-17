'use client';

import { useTransition } from 'react';
import { Badge, Button } from '@/components/ui';
import { formatPriceRange } from '@/modules/core/money';
import { deleteCatalogItemAction, toggleCatalogItemAction } from '../actions';

type Item = {
  id: string;
  kind: 'service' | 'product';
  name: string;
  priceMinor: number | null;
  priceMaxMinor: number | null;
  priceUnit: string | null;
  isAvailable: boolean;
};

export function CatalogItemRow({ item }: { item: Item }) {
  const [pending, start] = useTransition();

  return (
    <div className="card flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{item.name}</p>
        <p className="text-[13px] text-ink-500">
          {formatPriceRange(item.priceMinor, item.priceMaxMinor, item.priceUnit)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge tone={item.isAvailable ? 'success' : 'neutral'}>
          {item.isAvailable ? 'Showing' : 'Hidden'}
        </Badge>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => start(() => void toggleCatalogItemAction(item.id, !item.isAvailable))}
        >
          {item.isAvailable ? 'Hide' : 'Show'}
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (confirm(`Remove "${item.name}" from your page?`)) {
              start(() => void deleteCatalogItemAction(item.id));
            }
          }}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}
