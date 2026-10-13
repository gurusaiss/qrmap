/**
 * Durable, Postgres-backed rate limiting for the paths that matter most.
 *
 * `rate-limit.ts`'s in-process counters are fine for high-volume, low-stakes
 * paths (the analytics beacon) where a reset on deploy or a per-instance
 * limit multiplying under horizontal scaling is a tolerable, temporary
 * loosening. They are NOT fine for the paths that protect real money (OTP
 * SMS cost) or account security (login, TOTP): a process restart or a second
 * instance must not silently double an attacker's budget.
 *
 * This uses the existing `otp_codes`-style pattern — a plain Postgres table,
 * queried with a window `count(*)` — rather than introducing Redis. At V1
 * volumes this is a handful of indexed rows per key; revisit only if
 * measurement shows it matters (docs/03 §H's general policy).
 */
import { sql } from 'drizzle-orm';
import { withSystem } from '../tenancy';
import { RateLimitError } from './rate-limit';

export type DurableLimitSpec = { limit: number; windowSeconds: number };

/**
 * Atomically checks and records a hit for `key` within its rate-limit
 * bucket. Uses a single upsert-and-count statement so concurrent requests
 * for the same key cannot race past the limit between a read and a write.
 */
export async function enforceDurable(key: string, spec: DurableLimitSpec): Promise<void> {
  await withSystem(async ({ tx }) => {
    // One row per (key, window bucket). The bucket is "now" truncated down to
    // the window size, so every request within the same window shares a row
    // and INSERT ... ON CONFLICT ... DO UPDATE increments it atomically -
    // concurrent requests cannot race past the limit between a read and a
    // write, unlike a naive SELECT-count-then-INSERT.
    const rows = await tx.execute(sql`
      INSERT INTO rate_limit_buckets (bucket_key, window_start, hits)
      VALUES (
        ${key},
        to_timestamp(floor(extract(epoch FROM now()) / ${spec.windowSeconds}) * ${spec.windowSeconds}),
        1
      )
      ON CONFLICT (bucket_key, window_start)
      DO UPDATE SET hits = rate_limit_buckets.hits + 1
      RETURNING hits
    `);
    const hits = (rows[0] as { hits: number } | undefined)?.hits ?? 1;
    if (hits > spec.limit) {
      throw new RateLimitError(spec.windowSeconds, 'Too many requests. Please try again shortly.');
    }
  });
}

/** Best-effort cleanup of old buckets. Safe to run on a schedule; idempotent. */
export async function pruneRateLimitBuckets(olderThanHours = 24): Promise<void> {
  await withSystem(({ tx }) =>
    tx.execute(sql`
      DELETE FROM rate_limit_buckets
      WHERE window_start < now() - (${olderThanHours}::text || ' hours')::interval
    `),
  );
}

export const DURABLE_LIMITS = {
  otpRequestPerPhone: { limit: 3, windowSeconds: 15 * 60 },
  otpVerifyPerPhone: { limit: 10, windowSeconds: 15 * 60 },
  loginPerIp: { limit: 10, windowSeconds: 15 * 60 },
  pinPerUser: { limit: 5, windowSeconds: 15 * 60 },
} as const;
