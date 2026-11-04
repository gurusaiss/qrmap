/**
 * Database connections.
 *
 * TWO pools, deliberately:
 *
 *   appSql    -> role mdp_app.    RLS restricts every query to the tenant named
 *                in app.tenant_id. NO grants on identity tables at all.
 *   systemSql -> role mdp_system. Authentication, slug resolution, platform
 *                admin and background jobs.
 *
 * The separation is by database ROLE, so a merchant-facing request handler
 * cannot reach system scope even with a bug: it is on the wrong connection.
 *
 * Nothing outside src/modules/db and src/modules/tenancy may import this file.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { env } from '../core/env';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

type Pools = {
  appSql: postgres.Sql;
  systemSql: postgres.Sql;
  appDb: Database;
  systemDb: Database;
};

let pools: Pools | undefined;

function connect(url: string): postgres.Sql {
  return postgres(url, {
    max: env().NODE_ENV === 'test' ? 4 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => {},
  });
}

function pool(): Pools {
  if (pools) return pools;
  const e = env();
  const appSql = connect(e.DATABASE_URL);
  // Falls back to the app URL only so a single-role dev setup still boots;
  // production must set both.
  const systemSql = connect(e.DATABASE_URL_SYSTEM ?? e.DATABASE_URL);
  pools = {
    appSql,
    systemSql,
    appDb: drizzle(appSql, { schema }),
    systemDb: drizzle(systemSql, { schema }),
  };
  return pools;
}

/** Tenant-restricted pool. Only ever used through the tenancy module. */
export const appSql = (): postgres.Sql => pool().appSql;
export const appDb = (): Database => pool().appDb;

/** Unrestricted pool. Auth, slug resolution, admin, jobs. */
export const systemSql = (): postgres.Sql => pool().systemSql;
export const systemDb = (): Database => pool().systemDb;

export async function closeDb(): Promise<void> {
  if (!pools) return;
  await Promise.all([pools.appSql.end({ timeout: 5 }), pools.systemSql.end({ timeout: 5 })]);
  pools = undefined;
}

export { schema };
