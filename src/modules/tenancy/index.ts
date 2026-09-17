/**
 * The tenant-scope chokepoint - layer 3 of four (docs/03 §D).
 *
 * All tenant data access goes through `withTenant`. It opens a transaction on
 * the RLS-restricted pool and sets `app.tenant_id` for the life of that
 * transaction, so every statement inside is confined to one tenant by the
 * database itself.
 *
 * `withSystem` uses the unrestricted pool and exists only for authentication,
 * slug resolution, platform administration and background jobs. Merchant
 * request handlers must never call it.
 */
import { sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { appDb, systemDb, type Database } from '../db/client';

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export type TenantScope = {
  readonly tenantId: string;
  readonly tx: Tx;
};

export type SystemScope = {
  readonly tx: Tx;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run `fn` with every query confined to `tenantId`.
 *
 * `set_config` is used rather than `SET LOCAL` because it accepts a bound
 * parameter - the tenant id is never interpolated into SQL text.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (scope: TenantScope) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(tenantId)) {
    throw new TenantScopeError(`refusing to open a tenant scope for a non-uuid tenant id`);
  }
  return appDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn({ tenantId, tx });
  });
}

/**
 * Unrestricted scope. Auth, slug resolution, admin, jobs.
 * Every call site should be justifiable in review.
 */
export async function withSystem<T>(fn: (scope: SystemScope) => Promise<T>): Promise<T> {
  return systemDb().transaction(async (tx) => fn({ tx }));
}

export class TenantScopeError extends Error {
  override readonly name = 'TenantScopeError';
}

/**
 * Assert that a row loaded through any path belongs to the expected tenant.
 * Defence in depth for code that has already left the scope.
 */
export function assertTenant<T extends { tenantId: string }>(
  row: T | undefined | null,
  tenantId: string,
): T {
  if (!row) throw new TenantScopeError('row not found');
  if (row.tenantId !== tenantId) {
    throw new TenantScopeError('cross-tenant access blocked');
  }
  return row;
}

export type { PgTransaction };
