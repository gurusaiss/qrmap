/**
 * Rate limiting.
 *
 * In-process fixed-window counters. This is correct for a single application
 * instance, which is where V1 runs. KNOWN LIMITATION: with more than one
 * instance the effective limit multiplies by the instance count, so this must
 * move to a shared store (Redis, or a Postgres table) before horizontal
 * scaling. Tracked in docs/12-KNOWN-ISSUES.md.
 *
 * The OTP limit is additionally enforced against the database in
 * auth/service.ts, because it guards a real per-message cost and must survive
 * a process restart.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type LimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export function checkLimit(key: string, limit: number, windowSeconds: number): LimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** Periodically drop expired buckets so the map cannot grow without bound. */
export function sweepExpired(now = Date.now()): number {
  let removed = 0;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function resetAllLimits(): void {
  buckets.clear();
}

export const LIMITS = {
  otpRequestPerPhone: { limit: 3, windowSeconds: 15 * 60 },
  otpRequestPerIp: { limit: 10, windowSeconds: 60 * 60 },
  otpVerifyPerPhone: { limit: 10, windowSeconds: 15 * 60 },
  loginPerIp: { limit: 10, windowSeconds: 15 * 60 },
  analyticsPerVisitor: { limit: 60, windowSeconds: 60 },
  aiPerVisitorMinute: { limit: 5, windowSeconds: 60 },
  aiPerVisitorDay: { limit: 20, windowSeconds: 24 * 60 * 60 },
  mediaUploadPerTenant: { limit: 20, windowSeconds: 60 * 60 },
} as const;

export class RateLimitError extends Error {
  override readonly name = 'RateLimitError';
  readonly status = 429;
  constructor(readonly retryAfterSeconds: number, message = 'Too many requests. Please try again shortly.') {
    super(message);
  }
}

export function enforce(key: string, spec: { limit: number; windowSeconds: number }): void {
  const result = checkLimit(key, spec.limit, spec.windowSeconds);
  if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds);
}

// Opportunistic sweep; cheap and avoids an interval timer in serverless runtimes.
let lastSweep = Date.now();
export function maybeSweep(): void {
  const now = Date.now();
  if (now - lastSweep > 5 * 60 * 1000) {
    lastSweep = now;
    sweepExpired(now);
  }
}
