import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withSystem } from '../../tenancy';
import { closeDb, schema } from '../../db/client';
import { acknowledgeDomainChange, getPlatformSetting, recordDomainChange, shouldShowDomainChangeNotice } from '../settings';

const DISPLAY_NAME_PREFIX = 'domain-notice-spec-tenant-';
const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000f2';

async function createTestTenant(): Promise<string> {
  const [row] = await withSystem(({ tx }) =>
    tx.insert(schema.tenants).values({ displayName: `${DISPLAY_NAME_PREFIX}${randomUUID()}` }).returning({ id: schema.tenants.id }),
  );
  return row!.id;
}

/** 'domain_changed_at' is a genuinely global singleton key - clear it before and after this suite. */
async function clearDomainChangeSetting(): Promise<void> {
  await withSystem(({ tx }) => tx.delete(schema.platformSettings).where(eq(schema.platformSettings.key, 'domain_changed_at')));
}

beforeAll(clearDomainChangeSetting);
afterAll(async () => {
  await clearDomainChangeSetting();
  // Tenants are never hard-deleted by design (no DELETE grant exists for
  // anyone) - the test tenants this file created are left behind, same as a
  // real draft tenant would be.
  await closeDb();
});

describe('domain-change notice', () => {
  it('shows nothing for anyone before a domain change is ever recorded', async () => {
    const tenantId = await createTestTenant();
    expect(await getPlatformSetting('domain_changed_at')).toBeNull();
    expect(await shouldShowDomainChangeNotice(tenantId)).toBe(false);
  });

  it('shows the notice to a tenant that has never acknowledged, once a change is recorded', async () => {
    const tenantId = await createTestTenant();
    await recordDomainChange(ACTOR_USER_ID);

    expect(await getPlatformSetting('domain_changed_at')).not.toBeNull();
    expect(await shouldShowDomainChangeNotice(tenantId)).toBe(true);
  });

  it('stops showing the notice once that tenant acknowledges it', async () => {
    const tenantId = await createTestTenant();
    await recordDomainChange(ACTOR_USER_ID);
    expect(await shouldShowDomainChangeNotice(tenantId)).toBe(true);

    await acknowledgeDomainChange(tenantId);
    expect(await shouldShowDomainChangeNotice(tenantId)).toBe(false);
  });

  it('shows the notice again if a NEW domain change happens after this tenant already acknowledged the last one', async () => {
    const tenantId = await createTestTenant();
    await recordDomainChange(ACTOR_USER_ID);
    await acknowledgeDomainChange(tenantId);
    expect(await shouldShowDomainChangeNotice(tenantId)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 10)); // ensure a strictly later timestamp
    await recordDomainChange(ACTOR_USER_ID);
    expect(await shouldShowDomainChangeNotice(tenantId)).toBe(true);
  });
});
