import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { like, or } from 'drizzle-orm';
import { withSystem } from '../../tenancy';
import { closeDb, schema } from '../../db/client';
import { hashPassword } from '../crypto';
import { getLoginMethod, setMerchantPin, setPassword, loginWithPassword, loginWithPhonePin } from '../service';

const CTX = { ip: '127.0.0.1', userAgent: 'vitest' };
const EMAIL_PREFIX = 'account-credentials-spec+';
const PHONE_PREFIX = '+91900000'; // + 4 more digits, kept short and run-unique below

async function createEmailUser(label: string, password: string): Promise<{ userId: string; email: string }> {
  const email = `${EMAIL_PREFIX}${label}-${randomUUID()}@example.com`;
  const passwordHash = await hashPassword(password);
  const userId = await withSystem(async ({ tx }) => {
    const [user] = await tx.insert(schema.users).values({ email, passwordHash }).returning({ id: schema.users.id });
    return user!.id;
  });
  return { userId, email };
}

async function createPhoneUser(phone: string, pin: string): Promise<{ userId: string }> {
  const pinHash = await hashPassword(pin);
  const userId = await withSystem(async ({ tx }) => {
    const [user] = await tx.insert(schema.users).values({ phone, pinHash }).returning({ id: schema.users.id });
    return user!.id;
  });
  return { userId };
}

afterAll(async () => {
  await withSystem(({ tx }) =>
    tx.delete(schema.users).where(or(like(schema.users.email, `${EMAIL_PREFIX}%`), like(schema.users.phone, `${PHONE_PREFIX}%`))),
  );
  await closeDb();
});

describe('getLoginMethod', () => {
  it('identifies an email+password account', async () => {
    const { userId, email } = await createEmailUser('method', 'correct-horse-battery-staple');
    await expect(getLoginMethod(userId)).resolves.toEqual({ kind: 'email', email });
  });

  it('identifies a phone+PIN account', async () => {
    const phone = `${PHONE_PREFIX}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const { userId } = await createPhoneUser(phone, '123456');
    await expect(getLoginMethod(userId)).resolves.toEqual({ kind: 'phone', phone });
  });
});

describe('setPassword', () => {
  it('lets a merchant change their own password, and the new one signs in', async () => {
    const { userId, email } = await createEmailUser('change-pw', 'original-password-1');
    await setPassword(userId, 'brand-new-password-2');

    await expect(loginWithPassword(email, 'original-password-1', CTX)).rejects.toThrow('incorrect');
    const result = await loginWithPassword(email, 'brand-new-password-2', CTX);
    expect(result.step).toBe('done');
  });

  it('rejects a password shorter than 10 characters', async () => {
    const { userId } = await createEmailUser('too-short', 'original-password-1');
    await expect(setPassword(userId, 'short1')).rejects.toThrow('10 characters');
  });
});

describe('setMerchantPin', () => {
  it('lets a merchant change their own PIN, and the new one signs in', async () => {
    const phone = `${PHONE_PREFIX}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const { userId } = await createPhoneUser(phone, '111111');
    await setMerchantPin(userId, '222222');

    await expect(loginWithPhonePin(phone, '111111', CTX)).rejects.toThrow('incorrect');
    const result = await loginWithPhonePin(phone, '222222', CTX);
    expect(result.token).toBeTruthy();
    expect(result.userId).toBe(userId);
  });

  it('rejects anything that is not exactly 6 digits', async () => {
    const phone = `${PHONE_PREFIX}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const { userId } = await createPhoneUser(phone, '333333');
    await expect(setMerchantPin(userId, '12345')).rejects.toThrow('6 digits');
  });
});
