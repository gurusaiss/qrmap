import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { like } from 'drizzle-orm';
import { withSystem } from '../../tenancy';
import { closeDb, schema } from '../../db/client';
import { hashPassword } from '../crypto';
import { completePinLogin, loginWithPassword } from '../service';

const CTX = { ip: '127.0.0.1', userAgent: 'vitest' };
const PASSWORD = 'correct-horse-battery-staple';
const EMAIL_PREFIX = 'pin-login-spec+';

/** Creates a real platform-admin user row with a run-unique email, returns {userId, email}. */
async function createAdmin(label: string): Promise<{ userId: string; email: string }> {
  const email = `${EMAIL_PREFIX}${label}-${randomUUID()}@example.com`;
  const passwordHash = await hashPassword(PASSWORD);
  const userId = await withSystem(async ({ tx }) => {
    const [user] = await tx.insert(schema.users).values({ email, passwordHash }).returning({ id: schema.users.id });
    await tx.insert(schema.platformAdmins).values({ userId: user!.id });
    return user!.id;
  });
  return { userId, email };
}

afterAll(async () => {
  // These tests are the only thing that ever creates users with this prefix,
  // so this can't delete anything another test or real data owns.
  await withSystem(({ tx }) => tx.delete(schema.users).where(like(schema.users.email, `${EMAIL_PREFIX}%`)));
  await closeDb();
});

describe('platform-admin PIN login', () => {
  it('asks a brand-new admin to set up a PIN, then signs them in once it is set', async () => {
    const { userId, email } = await createAdmin('setup');

    const first = await loginWithPassword(email, PASSWORD, CTX);
    expect(first).toEqual({ step: 'pin_setup', userId });

    const { token } = await completePinLogin(userId, '123456', CTX, true);
    expect(token).toBeTruthy();

    const second = await loginWithPassword(email, PASSWORD, CTX);
    expect(second).toEqual({ step: 'pin_required', userId });
  });

  it('accepts the correct PIN and rejects a wrong one, for an admin who already has a PIN set', async () => {
    const { userId } = await createAdmin('verify');
    await completePinLogin(userId, '111222', CTX, true);

    await expect(completePinLogin(userId, '999999', CTX, false)).rejects.toThrow('not correct');

    const { token } = await completePinLogin(userId, '111222', CTX, false);
    expect(token).toBeTruthy();
  });

  it('refuses to silently overwrite an existing PIN via a replayed setup request', async () => {
    const { userId } = await createAdmin('resetup-guard');
    await completePinLogin(userId, '555555', CTX, true);

    await expect(completePinLogin(userId, '000000', CTX, true)).rejects.toThrow('already set');

    // The original PIN must still work - the replay must not have changed it.
    const { token } = await completePinLogin(userId, '555555', CTX, false);
    expect(token).toBeTruthy();
  });

  it('rejects anything that is not exactly 6 digits, before touching the database', async () => {
    const { userId } = await createAdmin('format');
    await expect(completePinLogin(userId, '12345', CTX, true)).rejects.toThrow('6 digits');
    await expect(completePinLogin(userId, 'abcdef', CTX, true)).rejects.toThrow('6 digits');
    await expect(completePinLogin(userId, '', CTX, true)).rejects.toThrow('6 digits');
  });
});
