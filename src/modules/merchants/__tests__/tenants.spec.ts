import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withSystem } from '../../tenancy';
import { closeDb, schema } from '../../db/client';
import { loginWithPassword, loginWithPhonePin } from '../../auth/service';
import { createTenant } from '../tenants';

const CTX = { ip: '127.0.0.1', userAgent: 'vitest' };
const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000f4';
const SLUG_PREFIX = 'tenants-spec-';
const CATEGORY_SLUG = 'tenants-spec-category';

let categoryId: string;

/** A fresh, syntactically valid test phone number, guaranteed exactly 5 trailing digits. */
function testPhone(): string {
  return `+9190000${Math.floor(10000 + Math.random() * 90000)}`;
}

beforeAll(async () => {
  const [category] = await withSystem(({ tx }) =>
    tx
      .insert(schema.categories)
      .values({ slug: CATEGORY_SLUG, name: 'Tenants spec category' })
      .onConflictDoNothing()
      .returning({ id: schema.categories.id }),
  );
  categoryId =
    category?.id ??
    (
      await withSystem(({ tx }) =>
        tx.select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.slug, CATEGORY_SLUG)).limit(1),
      )
    )[0]!.id;
});

afterAll(async () => {
  // Tenants are never hard-deleted (no DELETE grant exists for anyone) - the
  // test tenants and users this file created are left behind, same
  // convention as every other *.spec.ts in this codebase.
  await withSystem(({ tx }) => tx.delete(schema.categories).where(eq(schema.categories.slug, CATEGORY_SLUG)));
  await closeDb();
});

describe('createTenant — owner credentials', () => {
  it('creates an email+password owner who can immediately log in with it', async () => {
    const email = `${SLUG_PREFIX}${randomUUID()}@example.com`;
    const result = await createTenant({
      displayName: `Email Owner Shop ${randomUUID()}`,
      categoryId,
      slug: `${SLUG_PREFIX}${randomUUID()}`,
      owner: { method: 'email', email, password: 'correct-horse-battery-staple' },
      actorUserId: ACTOR_USER_ID,
    });

    expect(result.ownerLogin).toEqual({ method: 'email', email });

    const login = await loginWithPassword(email, 'correct-horse-battery-staple', CTX);
    expect(login).toMatchObject({ step: 'done' });
  });

  it('creates a phone+PIN owner who can immediately log in with it, needing no SMS', async () => {
    const phone = testPhone();
    const result = await createTenant({
      displayName: `Phone Owner Shop ${randomUUID()}`,
      categoryId,
      slug: `${SLUG_PREFIX}${randomUUID()}`,
      owner: { method: 'phone', phone, pin: '246810' },
      actorUserId: ACTOR_USER_ID,
    });

    expect(result.ownerLogin).toEqual({ method: 'phone', phone });

    const { token, userId } = await loginWithPhonePin(phone, '246810', CTX);
    expect(token).toBeTruthy();
    expect(userId).toBeTruthy();

    await expect(loginWithPhonePin(phone, '000000', CTX)).rejects.toThrow('incorrect');
  });

  it('refuses a password under 10 characters rather than creating a weak owner account', async () => {
    await expect(
      createTenant({
        displayName: `Weak Password Shop ${randomUUID()}`,
        categoryId,
        slug: `${SLUG_PREFIX}${randomUUID()}`,
        owner: { method: 'email', email: `${SLUG_PREFIX}${randomUUID()}@example.com`, password: 'short' },
        actorUserId: ACTOR_USER_ID,
      }),
    ).rejects.toThrow('10 characters');
  });

  it('refuses a PIN that is not exactly 6 digits', async () => {
    await expect(
      createTenant({
        displayName: `Bad Pin Shop ${randomUUID()}`,
        categoryId,
        slug: `${SLUG_PREFIX}${randomUUID()}`,
        owner: { method: 'phone', phone: testPhone(), pin: '123' },
        actorUserId: ACTOR_USER_ID,
      }),
    ).rejects.toThrow('6 digits');
  });

  it('refuses to create a second owner with an email already in use', async () => {
    const email = `${SLUG_PREFIX}${randomUUID()}@example.com`;
    await createTenant({
      displayName: `First Shop ${randomUUID()}`,
      categoryId,
      slug: `${SLUG_PREFIX}${randomUUID()}`,
      owner: { method: 'email', email, password: 'correct-horse-battery-staple' },
      actorUserId: ACTOR_USER_ID,
    });

    await expect(
      createTenant({
        displayName: `Second Shop ${randomUUID()}`,
        categoryId,
        slug: `${SLUG_PREFIX}${randomUUID()}`,
        owner: { method: 'email', email, password: 'another-long-password' },
        actorUserId: ACTOR_USER_ID,
      }),
    ).rejects.toThrow('already in use');
  });
});
