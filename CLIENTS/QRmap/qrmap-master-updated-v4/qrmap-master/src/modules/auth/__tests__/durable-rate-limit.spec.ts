import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { withSystem } from '../../tenancy';
import { closeDb } from '../../db/client';
import { DURABLE_LIMITS, enforceDurable, pruneRateLimitBuckets } from '../durable-rate-limit';
import { RateLimitError } from '../rate-limit';

async function clearBuckets(): Promise<void> {
  await withSystem(({ tx }) => tx.execute(sql`DELETE FROM rate_limit_buckets`));
}

beforeEach(async () => {
  await clearBuckets();
});

afterAll(async () => {
  await clearBuckets();
  await closeDb();
});

describe('enforceDurable', () => {
  it('allows requests up to the limit', async () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      await expect(enforceDurable(key, { limit: 3, windowSeconds: 60 })).resolves.toBeUndefined();
    }
  });

  it('rejects the request that exceeds the limit', async () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) await enforceDurable(key, { limit: 3, windowSeconds: 60 });
    await expect(enforceDurable(key, { limit: 3, windowSeconds: 60 })).rejects.toThrow(RateLimitError);
  });

  it('tracks distinct keys independently', async () => {
    const keyA = `test:a:${Math.random()}`;
    const keyB = `test:b:${Math.random()}`;
    await enforceDurable(keyA, { limit: 1, windowSeconds: 60 });
    // keyB has its own budget - exhausting keyA must not affect it.
    await expect(enforceDurable(keyB, { limit: 1, windowSeconds: 60 })).resolves.toBeUndefined();
    await expect(enforceDurable(keyA, { limit: 1, windowSeconds: 60 })).rejects.toThrow(RateLimitError);
  });

  it('survives concurrent requests without letting the count race past the limit', async () => {
    const key = `test:concurrent:${Math.random()}`;
    const spec = { limit: 5, windowSeconds: 60 };
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => enforceDurable(key, spec)),
    );
    const allowed = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;
    expect(allowed).toBe(5);
    expect(rejected).toBe(5);
  });

  it('is durable: a fresh call after a simulated restart still sees prior hits', async () => {
    // "Restart" here means nothing survives in-process state; enforceDurable
    // has none, so this test documents the property rather than exercising a
    // real process boundary. The row in Postgres is the actual durability.
    const key = `test:restart:${Math.random()}`;
    await enforceDurable(key, { limit: 2, windowSeconds: 60 });
    await enforceDurable(key, { limit: 2, windowSeconds: 60 });
    const persisted = await withSystem(async ({ tx }) => {
      const rows = await tx.execute(sql`SELECT hits FROM rate_limit_buckets WHERE bucket_key = ${key}`);
      return (rows[0] as { hits: number } | undefined)?.hits;
    });
    expect(persisted).toBe(2);
  });

  it('resets once the window has passed', async () => {
    const key = `test:window:${Math.random()}`;
    // A 1-second window that has already elapsed relative to "now" behaves as
    // a fresh bucket - verified by checking a request succeeds after
    // manually inserting a hit far enough in the past to be a different bucket.
    await withSystem(({ tx }) =>
      tx.execute(sql`
        INSERT INTO rate_limit_buckets (bucket_key, window_start, hits)
        VALUES (${key}, now() - interval '10 minutes', 999)
      `),
    );
    await expect(enforceDurable(key, { limit: 1, windowSeconds: 1 })).resolves.toBeUndefined();
  });
});

describe('pruneRateLimitBuckets', () => {
  it('removes buckets older than the cutoff and keeps recent ones', async () => {
    const oldKey = `test:old:${Math.random()}`;
    const recentKey = `test:recent:${Math.random()}`;
    await withSystem(({ tx }) =>
      tx.execute(sql`
        INSERT INTO rate_limit_buckets (bucket_key, window_start, hits) VALUES
        (${oldKey}, now() - interval '48 hours', 1),
        (${recentKey}, now(), 1)
      `),
    );
    await pruneRateLimitBuckets(24);
    const remaining = await withSystem(async ({ tx }) => {
      const rows = await tx.execute(
        sql`SELECT bucket_key FROM rate_limit_buckets WHERE bucket_key IN (${oldKey}, ${recentKey})`,
      );
      return (rows as unknown as { bucket_key: string }[]).map((r) => r.bucket_key);
    });
    expect(remaining).toEqual([recentKey]);
  });
});

describe('DURABLE_LIMITS', () => {
  it('defines a limit for every auth path that spends money or protects an account', () => {
    expect(DURABLE_LIMITS.otpRequestPerPhone.limit).toBeGreaterThan(0);
    expect(DURABLE_LIMITS.otpVerifyPerPhone.limit).toBeGreaterThan(0);
    expect(DURABLE_LIMITS.loginPerIp.limit).toBeGreaterThan(0);
    expect(DURABLE_LIMITS.pinPerUser.limit).toBeGreaterThan(0);
    expect(DURABLE_LIMITS.pinLoginPerPhone.limit).toBeGreaterThan(0);
  });
});
