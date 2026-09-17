/**
 * THE tenant-isolation suite.
 *
 * This is the most important test file in the codebase. It asserts, against a
 * real PostgreSQL instance with real RLS policies, that Merchant A cannot read,
 * list, update, insert or delete Merchant B's data through any path.
 *
 * A new tenant-owned table must be added to TENANT_TABLES below, or the
 * coverage test at the bottom fails the build.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { appDb, closeDb, systemDb } from '../../db/client';
import { withSystem, withTenant, assertTenant, TenantScopeError } from '../index';

/**
 * Drizzle wraps driver errors, so the PostgreSQL message lives further down the
 * `cause` chain. Assertions read the whole chain rather than the top message.
 */
async function rejectionText(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error: unknown) {
    const parts: string[] = [];
    let current: unknown = error;
    let depth = 0;
    while (current && depth < 10) {
      const e = current as { message?: string; detail?: string; cause?: unknown };
      if (e.message) parts.push(e.message);
      if (e.detail) parts.push(e.detail);
      current = e.cause;
      depth += 1;
    }
    return parts.join(' | ');
  }
  throw new Error('expected the operation to be rejected, but it succeeded');
}

/** Every tenant-owned table. Keep in step with src/modules/db/sql/10-rls.sql. */
const TENANT_TABLES = [
  'business_profiles',
  'merchant_slugs',
  'business_hours',
  'business_holidays',
  'media',
  'catalog_groups',
  'catalog_items',
  'offers',
  'qr_codes',
  'analytics_events',
  'analytics_daily',
  'ai_configs',
  'ai_conversations',
  'ai_messages',
  'ai_answer_cache',
  'subscriptions',
  'tenant_feature_overrides',
  'memberships',
] as const;

let tenantA = '';
let tenantB = '';
let categoryId = '';

beforeAll(async () => {
  await withSystem(async ({ tx }) => {
    const [cat] = await tx.execute(
      sql`INSERT INTO categories (slug, name) VALUES ('iso-test', 'Isolation Test')
          ON CONFLICT (slug) DO UPDATE SET name = excluded.name RETURNING id`,
    );
    categoryId = (cat as { id: string }).id;

    const mk = async (name: string): Promise<string> => {
      const [row] = await tx.execute(
        sql`INSERT INTO tenants (display_name, category_id, status, published_at)
            VALUES (${name}, ${categoryId}, 'active', now()) RETURNING id`,
      );
      return (row as { id: string }).id;
    };
    tenantA = await mk('Isolation Tenant A');
    tenantB = await mk('Isolation Tenant B');

    for (const [tenantId, label] of [
      [tenantA, 'A'],
      [tenantB, 'B'],
    ] as const) {
      await tx.execute(sql`INSERT INTO business_profiles (tenant_id, tagline) VALUES (${tenantId}, ${`tagline ${label}`})`);
      await tx.execute(sql`INSERT INTO catalog_items (tenant_id, kind, name, price_minor) VALUES (${tenantId}, 'service', ${`${label} secret service`}, 12345)`);
      await tx.execute(sql`INSERT INTO offers (tenant_id, title, is_published) VALUES (${tenantId}, ${`${label} secret offer`}, true)`);
      await tx.execute(sql`INSERT INTO ai_configs (tenant_id, is_enabled) VALUES (${tenantId}, true)`);
      await tx.execute(sql`INSERT INTO qr_codes (tenant_id, token) VALUES (${tenantId}, ${`tok${label.toLowerCase()}${Date.now()}`})`);
    }
  });
});

afterAll(async () => {
  await closeDb();
});

describe('layer 2: RLS confines the app role to one tenant', () => {
  it.each(TENANT_TABLES)('%s: tenant A sees none of tenant B rows', async (table) => {
    const leaked = await withTenant(tenantA, async ({ tx }) => {
      const rows = await tx.execute(
        sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)} WHERE tenant_id = ${tenantB}`,
      );
      return (rows[0] as { n: number } | undefined)?.n ?? 0;
    });
    expect(leaked).toBe(0);
  });

  it.each(TENANT_TABLES)('%s: every visible row belongs to the scoped tenant', async (table) => {
    const foreign = await withTenant(tenantA, async ({ tx }) => {
      const rows = await tx.execute(
        sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)} WHERE tenant_id <> ${tenantA}`,
      );
      return (rows[0] as { n: number } | undefined)?.n ?? 0;
    });
    expect(foreign).toBe(0);
  });

  it('tenant A can see its own rows (the policy is not simply denying everything)', async () => {
    const mine = await withTenant(tenantA, async ({ tx }) => {
      const rows = await tx.execute(sql`SELECT count(*)::int AS n FROM catalog_items`);
      return (rows[0] as { n: number } | undefined)?.n ?? 0;
    });
    expect(mine).toBeGreaterThan(0);
  });
});

describe('fail-closed behaviour', () => {
  it('returns zero rows when no tenant context is set', async () => {
    const visible = await appDb().transaction(async (tx) => {
      const rows = await tx.execute(sql`SELECT count(*)::int AS n FROM catalog_items`);
      return (rows[0] as { n: number } | undefined)?.n ?? 0;
    });
    expect(visible).toBe(0);
  });

  it('refuses to open a scope for a non-uuid tenant id', async () => {
    await expect(withTenant("' OR 1=1 --", async () => 'reached')).rejects.toThrow(TenantScopeError);
  });

  it('does not leak context between sequential scopes', async () => {
    await withTenant(tenantB, async ({ tx }) => {
      await tx.execute(sql`SELECT 1`);
    });
    const leaked = await appDb().transaction(async (tx) => {
      const rows = await tx.execute(sql`SELECT count(*)::int AS n FROM offers`);
      return (rows[0] as { n: number } | undefined)?.n ?? 0;
    });
    expect(leaked).toBe(0);
  });
});

describe('writes cannot cross a tenant boundary', () => {
  it('rejects inserting a row owned by another tenant (WITH CHECK)', async () => {
    const text = await rejectionText(() =>
      withTenant(tenantA, async ({ tx }) => {
        await tx.execute(
          sql`INSERT INTO catalog_items (tenant_id, kind, name) VALUES (${tenantB}, 'service', 'implanted')`,
        );
      }),
    );
    expect(text).toMatch(/row-level security/i);
  });

  it('an UPDATE aimed at another tenant affects zero rows', async () => {
    await withTenant(tenantA, async ({ tx }) => {
      await tx.execute(sql`UPDATE catalog_items SET name = 'hijacked' WHERE tenant_id = ${tenantB}`);
    });
    const survived = await withSystem(async ({ tx }) => {
      const rows = await tx.execute(
        sql`SELECT count(*)::int AS n FROM catalog_items WHERE tenant_id = ${tenantB} AND name = 'B secret service'`,
      );
      return (rows[0] as { n: number } | undefined)?.n ?? 0;
    });
    expect(survived).toBe(1);
  });

  it('a DELETE aimed at another tenant affects zero rows', async () => {
    await withTenant(tenantA, async ({ tx }) => {
      await tx.execute(sql`DELETE FROM offers WHERE tenant_id = ${tenantB}`);
    });
    const survived = await withSystem(async ({ tx }) => {
      const rows = await tx.execute(
        sql`SELECT count(*)::int AS n FROM offers WHERE tenant_id = ${tenantB}`,
      );
      return (rows[0] as { n: number } | undefined)?.n ?? 0;
    });
    expect(survived).toBe(1);
  });

  it('cannot escalate by overwriting tenant_id on its own row', async () => {
    const text = await rejectionText(() =>
      withTenant(tenantA, async ({ tx }) => {
        await tx.execute(
          sql`UPDATE catalog_items SET tenant_id = ${tenantB} WHERE tenant_id = ${tenantA}`,
        );
      }),
    );
    expect(text).toMatch(/row-level security/i);
  });
});

describe('identity tables are unreachable from the tenant role', () => {
  it.each(['users', 'sessions', 'otp_codes', 'platform_admins'])(
    '%s is not readable by the app role',
    async (table) => {
      const text = await rejectionText(() =>
        withTenant(tenantA, async ({ tx }) => {
          await tx.execute(sql`SELECT count(*) FROM ${sql.identifier(table)}`);
        }),
      );
      expect(text).toMatch(/permission denied/i);
    },
  );
});

describe('layer 1: composite foreign keys reject cross-tenant references', () => {
  it('a catalog item cannot point at another tenant catalog group', async () => {
    const foreignGroupId = await withSystem(async ({ tx }) => {
      const [row] = await tx.execute(
        sql`INSERT INTO catalog_groups (tenant_id, name) VALUES (${tenantB}, 'B group') RETURNING id`,
      );
      return (row as { id: string }).id;
    });

    const text = await rejectionText(() =>
      withSystem(async ({ tx }) => {
        await tx.execute(
          sql`INSERT INTO catalog_items (tenant_id, kind, name, group_id)
              VALUES (${tenantA}, 'service', 'cross linked', ${foreignGroupId})`,
        );
      }),
    );
    expect(text).toMatch(/foreign key|violates/i);
  });

  it('an offer cannot point at another tenant media row', async () => {
    const foreignMediaId = await withSystem(async ({ tx }) => {
      const [row] = await tx.execute(
        sql`INSERT INTO media (tenant_id, storage_key, mime) VALUES (${tenantB}, 'k', 'image/avif') RETURNING id`,
      );
      return (row as { id: string }).id;
    });

    const text = await rejectionText(() =>
      withSystem(async ({ tx }) => {
        await tx.execute(
          sql`INSERT INTO offers (tenant_id, title, media_id) VALUES (${tenantA}, 'cross media', ${foreignMediaId})`,
        );
      }),
    );
    expect(text).toMatch(/foreign key|violates/i);
  });
});

describe('permanence invariants', () => {
  it('a slug can never be deleted', async () => {
    const text = await rejectionText(() =>
      withSystem(async ({ tx }) => {
        await tx.execute(
          sql`INSERT INTO merchant_slugs (slug, tenant_id, is_primary) VALUES ('iso-perm-test', ${tenantA}, false)`,
        );
        await tx.execute(sql`DELETE FROM merchant_slugs WHERE slug = 'iso-perm-test'`);
      }),
    );
    expect(text).toMatch(/permanent|permission denied/i);
  });

  it('a tenant can never be hard-deleted', async () => {
    const text = await rejectionText(() =>
      withSystem(async ({ tx }) => {
        await tx.execute(sql`DELETE FROM tenants WHERE id = ${tenantA}`);
      }),
    );
    expect(text).toMatch(/permanent|permission denied/i);
  });

  it('audit rows cannot be altered or removed', async () => {
    const text = await rejectionText(() =>
      withSystem(async ({ tx }) => {
        await tx.execute(sql`INSERT INTO audit_logs (action, actor_type) VALUES ('tenant.create', 'system')`);
        await tx.execute(sql`UPDATE audit_logs SET action = 'tampered'`);
      }),
    );
    expect(text).toMatch(/permanent|permission denied/i);
  });
});

describe('application-level guard', () => {
  it('assertTenant rejects a row belonging to another tenant', () => {
    expect(() => assertTenant({ tenantId: tenantB }, tenantA)).toThrow(TenantScopeError);
    expect(() => assertTenant(undefined, tenantA)).toThrow(TenantScopeError);
    expect(assertTenant({ tenantId: tenantA }, tenantA)).toEqual({ tenantId: tenantA });
  });
});

describe('coverage gate', () => {
  it('every table with a tenant_id column has RLS enabled and forced', async () => {
    const rows = await systemDb().execute(sql`
      SELECT c.relname AS table_name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY 1
    `);

    const unprotected = (rows as unknown as { table_name: string; enabled: boolean; forced: boolean }[])
      .filter((r) => !r.enabled || !r.forced)
      .map((r) => r.table_name);

    expect(unprotected, `tables missing RLS: ${unprotected.join(', ')}`).toEqual([]);
  });

  it('every tenant table in the database is covered by this test file', async () => {
    const rows = await systemDb().execute(sql`
      SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY 1
    `);

    const inDatabase = (rows as unknown as { table_name: string }[])
      .map((r) => r.table_name)
      // audit_logs carries a nullable tenant_id but is append-only platform data.
      .filter((t) => t !== 'audit_logs');

    const missing = inDatabase.filter((t) => !TENANT_TABLES.includes(t as never));
    expect(
      missing,
      `add these tables to TENANT_TABLES in isolation.spec.ts: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('neither application role can bypass RLS', async () => {
    const rows = await systemDb().execute(sql`
      SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname IN ('mdp_app', 'mdp_system')
    `);
    for (const role of rows as unknown as { rolname: string; rolbypassrls: boolean; rolsuper: boolean }[]) {
      expect(role.rolbypassrls, `${role.rolname} must not have BYPASSRLS`).toBe(false);
      expect(role.rolsuper, `${role.rolname} must not be superuser`).toBe(false);
    }
  });
});
