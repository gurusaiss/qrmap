'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { Badge, Button } from '@/components/ui';
import { formatPriceRange } from '@/modules/core/money';
import { deleteCatalogItemAction, reorderCatalogAction, toggleCatalogItemAction } from '../actions';

type Item = {
  id: string;
  kind: 'service' | 'product';
  name: string;
  description: string | null;
  priceMinor: number | null;
  priceMaxMinor: number | null;
  priceUnit: string | null;
  stockStatus: 'in_stock' | 'low' | 'out' | 'made_to_order' | null;
  isAvailable: boolean;
};

const STOCK_LABEL: Record<string, string> = {
  low: 'Low stock',
  out: 'Out of stock',
  made_to_order: 'Made to order',
};

const STOCK_TONE: Record<string, 'warning' | 'neutral'> = {
  low: 'warning',
  out: 'neutral',
  made_to_order: 'neutral',
};

export function CatalogItemRow({
  item,
  photoUrl,
  siblingIds,
  position,
}: {
  item: Item;
  photoUrl: string | null;
  /** The full ordered id list of the list this row belongs to (a category, or "uncategorised"). */
  siblingIds?: string[];
  position?: { index: number; count: number };
}) {
  const [pending, start] = useTransition();
  const stockLabel = item.stockStatus ? STOCK_LABEL[item.stockStatus] : null;

  const move = (direction: -1 | 1) => {
    if (!siblingIds) return;
    const from = position!.index;
    const to = from + direction;
    if (to < 0 || to >= siblingIds.length) return;
    const reordered = [...siblingIds];
    const [moved] = reordered.splice(from, 1);
    if (moved === undefined) return;
    reordered.splice(to, 0, moved);
    start(() => void reorderCatalogAction(reordered));
  };

  return (
    <div className="card flex items-start gap-3 p-3">
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-[var(--radius-sm)] object-cover" />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-ink-100 text-ink-300">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-6 w-6">
            <rect x="2.5" y="4" width="15" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="7" cy="8.2" r="1.3" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="m4 15 4.3-4.3a1.5 1.5 0 0 1 2.1 0L13 13.3M14 11.6l.4-.4a1.5 1.5 0 0 1 2.1 0L18 12.6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-medium">{item.name}</p>
          <Badge tone={item.isAvailable ? 'success' : 'neutral'}>{item.isAvailable ? 'Showing' : 'Hidden'}</Badge>
        </div>
        <p className="mt-0.5 text-[14px] font-semibold text-ink-900">
          {formatPriceRange(item.priceMinor, item.priceMaxMinor, item.priceUnit)}
        </p>
        {item.description && <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-500">{item.description}</p>}
        {stockLabel && (
          <div className="mt-1">
            <Badge tone={STOCK_TONE[item.stockStatus as string]}>{stockLabel}</Badge>
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          {siblingIds && position && (
            <>
              <button
                type="button"
                aria-label="Move up"
                disabled={pending || position.index === 0}
                onClick={() => move(-1)}
                className="tap-target rounded-[var(--radius-sm)] px-2 text-ink-500 transition-colors hover:bg-ink-100 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={pending || position.index === position.count - 1}
                onClick={() => move(1)}
                className="tap-target rounded-[var(--radius-sm)] px-2 text-ink-500 transition-colors hover:bg-ink-100 disabled:opacity-30"
              >
                ↓
              </button>
            </>
          )}
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => start(() => void toggleCatalogItemAction(item.id, !item.isAvailable))}
          >
            {item.isAvailable ? 'Hide' : 'Show'}
          </Button>
          <Link
            href={`/app/catalog/${item.id}`}
            className="tap-target rounded-[var(--radius-sm)] px-3 text-[14px] font-medium text-ink-700 transition-colors hover:bg-ink-100"
          >
            Edit
          </Link>
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
    </div>
  );
}
