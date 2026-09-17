/**
 * Migration runner.
 *
 * Order matters:
 *   1. functions   - uuidv7() must exist before tables that default to it
 *   2. drizzle     - table DDL
 *   3. rls         - policies and grants (needs the tables)
 *   4. constraints - triggers and CHECKs (needs the tables)
 *
 * Runs as the OWNER role. The application never uses this connection.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');

async function applyFile(sql: postgres.Sql, name: string): Promise<void> {
  const text = await readFile(join(here, 'sql', name), 'utf8');
  await sql.unsafe(text);
  process.stdout.write(`  applied ${name}\n`);
}

export async function runMigrations(ownerUrl: string): Promise<void> {
  const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  try {
    process.stdout.write('running migrations\n');
    await applyFile(sql, '00-functions.sql');

    await drizzleMigrate(drizzle(sql), { migrationsFolder: join(root, 'drizzle') });
    process.stdout.write('  applied drizzle migrations\n');

    await applyFile(sql, '10-rls.sql');
    await applyFile(sql, '20-constraints.sql');
    process.stdout.write('migrations complete\n');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '');
if (invokedDirectly) {
  const url = process.env.DATABASE_URL_OWNER;
  if (!url) {
    process.stderr.write('DATABASE_URL_OWNER is not set\n');
    process.exit(1);
  }
  runMigrations(url).catch((err: unknown) => {
    process.stderr.write(`migration failed: ${String(err)}\n`);
    process.exit(1);
  });
}
