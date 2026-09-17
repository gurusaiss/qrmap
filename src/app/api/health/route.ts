import { systemSql } from '@/modules/db/client';

export const runtime = 'nodejs';

/**
 * Liveness/readiness probe for uptime monitoring and the Docker HEALTHCHECK.
 *
 * Checks a real database round trip rather than just "the process is up" -
 * per docs/03-ARCHITECTURE.md §J, the core promise of this product is that a
 * printed QR resolves, and that depends on the database being reachable.
 * A process that is running but cannot reach Postgres should NOT report
 * healthy: an orchestrator should restart or fail it over instead.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await systemSql()`SELECT 1`;
    return Response.json(
      { status: 'ok', db: 'ok', latencyMs: Date.now() - startedAt },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      { status: 'error', db: 'unreachable', error: error instanceof Error ? error.message : 'unknown' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
