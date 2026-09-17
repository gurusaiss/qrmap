/**
 * Maintenance worker.
 *
 * Runs the jobs that docs/12-KNOWN-ISSUES.md flagged as "implemented but not
 * wired to a scheduler": analytics rollup, raw-event pruning, and rate-limit
 * bucket cleanup. Intended to be invoked by an external scheduler (cron,
 * systemd timer, or a platform's own scheduled-task feature) rather than run
 * as a long-lived process — this keeps the same "no extra always-on service"
 * posture as the rest of the architecture (docs/03 §H explicitly defers
 * queues until measurement demands them).
 *
 * Usage: `npm run worker` once, or on a schedule (recommended: hourly).
 * Safe to run concurrently or to skip a run - every job here is idempotent.
 */
import { rollupDay, pruneRawEvents } from '../analytics';
import { pruneRateLimitBuckets } from '../auth/durable-rate-limit';
import { closeDb } from './client';

function yesterday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runMaintenance(): Promise<void> {
  const log = (msg: string): void => {
    process.stdout.write(`[worker] ${msg}\n`);
  };

  log('starting');

  // Roll up both yesterday (final numbers, once the day is fully over in UTC)
  // and today (so the merchant dashboard's "today" figures are not empty).
  for (const day of [yesterday(), today()]) {
    try {
      await rollupDay(day);
      log(`rolled up analytics for ${day}`);
    } catch (error) {
      log(`FAILED rollup for ${day}: ${String(error)}`);
    }
  }

  try {
    await pruneRawEvents(90);
    log('pruned raw analytics events older than 90 days');
  } catch (error) {
    log(`FAILED pruning raw events: ${String(error)}`);
  }

  try {
    await pruneRateLimitBuckets(24);
    log('pruned rate-limit buckets older than 24 hours');
  } catch (error) {
    log(`FAILED pruning rate-limit buckets: ${String(error)}`);
  }

  log('done');
}

if (process.argv[1]?.endsWith('worker.ts') || process.argv[1]?.endsWith('worker.js')) {
  runMaintenance()
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      process.stderr.write(`worker failed: ${String(error)}\n`);
      process.exit(1);
    });
}
