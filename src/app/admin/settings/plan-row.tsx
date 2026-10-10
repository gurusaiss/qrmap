'use client';

import { useState, useTransition } from 'react';
import { Badge, Button, Card, Input } from '@/components/ui';
import { formatMoney, parseMoneyToMinor } from '@/modules/core/money';
import { togglePlanPublicAction, updatePlanPriceAction } from './actions';

type Plan = {
  id: string;
  key: string;
  name: string;
  priceMinor: number;
  currency: string;
  interval: string;
  isPublic: boolean;
  limits: unknown;
  features: unknown;
};

export function PlanRow({ plan }: { plan: Plan }) {
  const [pending, start] = useTransition();
  const [price, setPrice] = useState(() => (plan.priceMinor / 100).toString());

  const limits = (plan.limits ?? {}) as Record<string, number>;
  const features = (plan.features ?? {}) as Record<string, boolean | string>;

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-semibold">{plan.name}</p>
          <Badge tone={plan.isPublic ? 'success' : 'neutral'}>{plan.isPublic ? 'Public' : 'Hidden'}</Badge>
        </div>
        <p className="mt-1 text-[13px] text-ink-500">
          {Object.entries(limits)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' · ')}
        </p>
        <p className="text-[13px] text-ink-400">
          {Object.entries(features)
            .filter(([, v]) => v === true)
            .map(([k]) => k)
            .join(', ') || 'No extra features'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-ink-500">₹</span>
        <Input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          className="w-24"
        />
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            const minor = parseMoneyToMinor(price);
            if (minor !== null) start(() => void updatePlanPriceAction(plan.id, minor));
          }}
        >
          Save
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => start(() => void togglePlanPublicAction(plan.id, !plan.isPublic))}
        >
          {plan.isPublic ? 'Hide' : 'Publish'}
        </Button>
      </div>
      <p className="sr-only">{formatMoney(plan.priceMinor, plan.currency as 'INR')}</p>
    </Card>
  );
}
