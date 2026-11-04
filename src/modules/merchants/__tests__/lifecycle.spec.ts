import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { withSystem } from '../../tenancy';
import { closeDb, schema } from '../../db/client';
import { createTenant, publishTenant, setTenantStatus } from '../tenants';
import { changeSlug, primarySlugFor, resolveSlug, SlugUnavailableError } from '../slugs';
import { loadPublicPage } from '../public-page';

const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000f6';
const CATEGORY_SLUG = 'lifecycle-spec-category';

let categoryId = '';

const shortId = () => randomUUID().replace(/-/g, '').slice(0, 14);

async function newShop(opts: { publish?: boolean } = {}) {
  const slug = `lc-${shortId()}`;
  const { tenantId } = await createTenant({
    displayName: `Lifecycle Spec Shop ${randomUUID()}`,
    categoryId,
    slug,
    owner: { method: 'email', email: `${slug}@example.com`, password: 'correct-horse-battery-staple' },
    actorUserId: ACTOR_USER_ID,
  });
  if (opts.publish ?? true) await publishTenant(tenantId, ACTOR_USER_ID);
  return { tenantId, slug };
}

async function auditActions(tenantId: string): Promise<string[]> {
  const rows = await withSystem(({ tx }) =>
    tx.select({ action: schema.auditLogs.action }).from(schema.auditLogs).where(eq(schema.auditLogs.tenantId, tenantId)),
  );
  return rows.map((r) => r.action);
}

beforeAll(async () => {
  const [row] = await withSystem(({ tx }) =>
    tx.execute(
      sql`INSERT INTO categories (slug, name) VALUES (${CATEGORY_SLUG}, 'Lifecycle spec category')
          ON CONFLICT (slug) DO UPDATE SET name = excluded.name RETURNING id`,
    ),
  );
  categoryId = (row as { id: string }).id;
});

// Tenants are never deleted, so the category stays too (same convention as the other specs).
afterAll(async () => {
  await closeDb();
});

describe('slug permanence (printed QR codes must keep working)', () => {
  it('after a rename the old address becomes a permanent alias of the new one', async () => {
    const { tenantId, slug: oldSlug } = await newShop();
    const newSlug = `lc-${shortId()}`;

    const result = await changeSlug({ tenantId, newSlug, actorUserId: ACTOR_USER_ID });
    expect(result).toEqual({ previousSlug: oldSlug, newSlug });

    expect(await primarySlugFor(tenantId)).toBe(newSlug);
    expect(await resolveSlug(newSlug)).toEqual({ kind: 'canonical', tenantId, slug: newSlug });
    expect(await resolveSlug(oldSlug)).toEqual({ kind: 'alias', tenantId, canonicalSlug: newSlug });
    expect(await loadPublicPage(oldSlug)).toEqual({ kind: 'redirect', toSlug: newSlug });
    expect((await loadPublicPage(newSlug)).kind).toBe('ok');
    expect(await auditActions(tenantId)).toContain('slug.change');
  });

  it('survives a chain of renames: every earlier address still lands on the current one', async () => {
    const { tenantId, slug: first } = await newShop();
    const second = `lc-${shortId()}`;
    const third = `lc-${shortId()}`;
    await changeSlug({ tenantId, newSlug: second, actorUserId: ACTOR_USER_ID });
    await changeSlug({ tenantId, newSlug: third, actorUserId: ACTOR_USER_ID });

    for (const old of [first, second]) {
      expect(await resolveSlug(old)).toEqual({ kind: 'alias', tenantId, canonicalSlug: third });
    }
    expect((await resolveSlug(third)).kind).toBe('canonical');
  });

  it('can switch back to a former address without losing the other one', async () => {
    const { tenantId, slug: first } = await newShop();
    const second = `lc-${shortId()}`;
    await changeSlug({ tenantId, newSlug: second, actorUserId: ACTOR_USER_ID });
    await changeSlug({ tenantId, newSlug: first, actorUserId: ACTOR_USER_ID });

    expect(await resolveSlug(first)).toMatchObject({ kind: 'canonical' });
    expect(await resolveSlug(second)).toEqual({ kind: 'alias', tenantId, canonicalSlug: first });
  });

  it("refuses another shop's address, current or retired, and reserved words", async () => {
    const a = await newShop();
    const b = await newShop();
    await expect(changeSlug({ tenantId: b.tenantId, newSlug: a.slug, actorUserId: ACTOR_USER_ID })).rejects.toBeInstanceOf(
      SlugUnavailableError,
    );

    const aRenamed = `lc-${shortId()}`;
    await changeSlug({ tenantId: a.tenantId, newSlug: aRenamed, actorUserId: ACTOR_USER_ID });
    await expect(changeSlug({ tenantId: b.tenantId, newSlug: a.slug, actorUserId: ACTOR_USER_ID })).rejects.toMatchObject({
      reason: 'taken',
    });

    await expect(changeSlug({ tenantId: b.tenantId, newSlug: 'admin', actorUserId: ACTOR_USER_ID })).rejects.toMatchObject({
      reason: 'reserved',
    });
    expect(await primarySlugFor(b.tenantId)).toBe(b.slug);
  });

  it('the database itself refuses to delete a slug', async () => {
    const { slug } = await newShop();
    await expect(
      withSystem(({ tx }) => tx.delete(schema.merchantSlugs).where(eq(schema.merchantSlugs.slug, slug))),
    ).rejects.toThrow();
    expect((await resolveSlug(slug)).kind).toBe('canonical');
  });
});

describe('tenant lifecycle as the public sees it', () => {
  it('an unpublished shop shows "coming soon", and publishing makes it live', async () => {
    const { tenantId, slug } = await newShop({ publish: false });
    expect((await loadPublicPage(slug)).kind).toBe('coming_soon');
    await publishTenant(tenantId, ACTOR_USER_ID);
    expect((await loadPublicPage(slug)).kind).toBe('ok');
  });

  it('suspend hides the page behind a branded status, and activate restores it, both audited', async () => {
    const { tenantId, slug } = await newShop();
    await setTenantStatus({ tenantId, status: 'suspended', actorUserId: ACTOR_USER_ID, reason: 'non-payment' });
    expect((await loadPublicPage(slug)).kind).toBe('suspended');

    await setTenantStatus({ tenantId, status: 'active', actorUserId: ACTOR_USER_ID });
    expect((await loadPublicPage(slug)).kind).toBe('ok');

    const actions = await auditActions(tenantId);
    expect(actions).toContain('tenant.suspend');
    expect(actions).toContain('tenant.activate');
  });

  it('delete is a soft delete: the page says "gone" but the address is never freed for reuse', async () => {
    const { tenantId, slug } = await newShop();
    await setTenantStatus({ tenantId, status: 'deleted', actorUserId: ACTOR_USER_ID, reason: 'closed down' });

    expect((await loadPublicPage(slug)).kind).toBe('gone');
    expect(await resolveSlug(slug)).toEqual({ kind: 'canonical', tenantId, slug });

    const [row] = await withSystem(({ tx }) =>
      tx.select({ deletedAt: schema.tenants.deletedAt }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)),
    );
    expect(row?.deletedAt).toBeInstanceOf(Date);

    const other = await newShop();
    await expect(changeSlug({ tenantId: other.tenantId, newSlug: slug, actorUserId: ACTOR_USER_ID })).rejects.toMatchObject({
      reason: 'taken',
    });
    expect(await auditActions(tenantId)).toContain('tenant.delete');
  });

  it('tenant rows cannot be hard-deleted even by the system role', async () => {
    const { tenantId } = await newShop();
    await expect(
      withSystem(({ tx }) => tx.delete(schema.tenants).where(eq(schema.tenants.id, tenantId))),
    ).rejects.toThrow();
  });

  it('the audit log is append-only', async () => {
    const { tenantId } = await newShop();
    await expect(
      withSystem(({ tx }) =>
        tx.update(schema.auditLogs).set({ action: 'tenant.update' }).where(and(eq(schema.auditLogs.tenantId, tenantId))),
      ),
    ).rejects.toThrow();
    await expect(
      withSystem(({ tx }) => tx.delete(schema.auditLogs).where(eq(schema.auditLogs.tenantId, tenantId))),
    ).rejects.toThrow();
  });
});
