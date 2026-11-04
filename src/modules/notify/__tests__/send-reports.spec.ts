import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { withSystem, withTenant } from '../../tenancy';
import { appDb, closeDb, schema } from '../../db/client';
import { createTenant, publishTenant, setTenantStatus } from '../../merchants/tenants';
import { MAX_ATTEMPTS, reportRecipientFor, sendMonthlyReports } from '../send-reports';
import { WhatsAppError, type TemplateMessage, type WhatsAppDriver } from '../whatsapp';

const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000f8';
const CATEGORY_SLUG = 'send-reports-spec-category';
const FEB_RUN = new Date('2026-03-02T06:00:00Z'); // reports February 2026
const MAR_RUN = new Date('2026-04-02T06:00:00Z'); // reports March 2026

let categoryId = '';
const created: string[] = [];

const shortId = () => randomUUID().replace(/-/g, '').slice(0, 12);
const phone = () => `+9190${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

type Shop = { tenantId: string; slug: string; name: string; digits: string };

async function newShop(opts: { optIn?: boolean; publish?: boolean; ownerPhone?: string | null; profileWhatsapp?: string } = {}): Promise<Shop> {
  const slug = `sr-${shortId()}`;
  const name = `Reports Spec Shop ${shortId()}`;
  const ownerPhone = opts.ownerPhone === null ? null : (opts.ownerPhone ?? phone());
  const { tenantId } = await createTenant({
    displayName: name,
    categoryId,
    slug,
    owner: ownerPhone
      ? { method: 'phone', phone: ownerPhone, pin: '135790' }
      : { method: 'email', email: `${slug}@example.com`, password: 'correct-horse-battery-staple' },
    actorUserId: ACTOR_USER_ID,
  });
  created.push(tenantId);
  if (opts.publish ?? true) await publishTenant(tenantId, ACTOR_USER_ID);
  await withSystem(async ({ tx }) => {
    await tx.insert(schema.businessProfiles).values({ tenantId }).onConflictDoNothing();
    await tx
      .update(schema.businessProfiles)
      .set({ monthlyReportWhatsapp: opts.optIn ?? true, whatsapp: opts.profileWhatsapp ?? null })
      .where(eq(schema.businessProfiles.tenantId, tenantId));
  });
  const digits = (ownerPhone ?? opts.profileWhatsapp ?? '').replace(/\D/g, '');
  return { tenantId, slug, name, digits };
}

function spy(name = 'spy', behaviour: (m: TemplateMessage, call: number) => Promise<{ messageId: string | null }> | { messageId: string | null } = () => ({ messageId: 'wamid.test' })) {
  const calls: TemplateMessage[] = [];
  const driver: WhatsAppDriver = {
    name,
    async send(message) {
      calls.push(message);
      return behaviour(message, calls.length);
    },
  };
  return { driver, calls, to: (shop: Shop) => calls.filter((c) => c.to === shop.digits) };
}

async function row(shop: Shop, period = '2026-02') {
  const [r] = await withSystem(({ tx }) =>
    tx
      .select()
      .from(schema.reportDeliveries)
      .where(and(eq(schema.reportDeliveries.tenantId, shop.tenantId), eq(schema.reportDeliveries.period, period))),
  );
  return r;
}

const run = (s: ReturnType<typeof spy>, over: Parameters<typeof sendMonthlyReports>[0] = {}) =>
  sendMonthlyReports({ now: FEB_RUN, driver: s.driver, template: 'monthly_report', language: 'en', ...over });

beforeAll(async () => {
  const [r] = await withSystem(({ tx }) =>
    tx.execute(
      sql`INSERT INTO categories (slug, name) VALUES (${CATEGORY_SLUG}, 'Send reports spec category')
          ON CONFLICT (slug) DO UPDATE SET name = excluded.name RETURNING id`,
    ),
  );
  categoryId = (r as { id: string }).id;
});

// Tenants are never deleted; opt them out so later runs of any spec never see them.
afterAll(async () => {
  if (created.length > 0) {
    await withSystem(({ tx }) =>
      tx.update(schema.businessProfiles).set({ monthlyReportWhatsapp: false }).where(inArray(schema.businessProfiles.tenantId, created)),
    );
  }
  await closeDb();
});

describe('who gets a report', () => {
  it('an opted-in, published shop gets exactly one templated message at its owner number', async () => {
    const shop = await newShop();
    const s = spy();
    const summary = await run(s);

    expect(summary.period).toBe('2026-02');
    const mine = s.to(shop);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ template: 'monthly_report', language: 'en' });
    expect(mine[0]!.bodyParams.slice(0, 2)).toEqual([shop.name, 'February 2026']);
    expect(mine[0]!.bodyParams).toHaveLength(6);
    expect(await row(shop)).toMatchObject({ status: 'sent', attempts: 1, provider: 'spy', providerMessageId: 'wamid.test' });
  });

  it('a shop that has not opted in gets nothing', async () => {
    const shop = await newShop({ optIn: false });
    const s = spy();
    await run(s);
    expect(s.to(shop)).toHaveLength(0);
    expect(await row(shop)).toBeUndefined();
  });

  it('an unpublished or suspended shop gets nothing', async () => {
    const draft = await newShop({ publish: false });
    const suspended = await newShop();
    await setTenantStatus({ tenantId: suspended.tenantId, status: 'suspended', actorUserId: ACTOR_USER_ID });
    const s = spy();
    await run(s);
    expect(s.to(draft)).toHaveLength(0);
    expect(s.to(suspended)).toHaveLength(0);
  });

  it("each message carries its own shop's name and goes to its own number", async () => {
    const a = await newShop();
    const b = await newShop();
    const s = spy();
    await run(s);
    expect(s.to(a)[0]!.bodyParams[0]).toBe(a.name);
    expect(s.to(b)[0]!.bodyParams[0]).toBe(b.name);
    expect(a.digits).not.toBe(b.digits);
  });
});

describe('recipient', () => {
  it('uses the owner login phone, normalised to digits', async () => {
    const raw = phone();
    const shop = await newShop({ ownerPhone: raw });
    expect(await reportRecipientFor(shop.tenantId)).toBe(raw.replace(/\D/g, ''));
  });

  it('falls back to the shop WhatsApp number when the owner signs in with email', async () => {
    const digits = `91${Math.floor(7_000_000_000 + Math.random() * 999_999_999)}`;
    const shop = await newShop({ ownerPhone: null, profileWhatsapp: `+${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}` });
    expect(await reportRecipientFor(shop.tenantId)).toBe(digits);
    const s = spy();
    await run(s);
    expect(s.calls.filter((c) => c.to === digits)).toHaveLength(1);
  });

  it('skips, records nothing, and counts a shop with no usable number', async () => {
    const shop = await newShop({ ownerPhone: null });
    expect(await reportRecipientFor(shop.tenantId)).toBeNull();
    const s = spy();
    const summary = await run(s);
    expect(summary.noNumber).toBeGreaterThanOrEqual(1);
    expect(await row(shop)).toBeUndefined();
  });
});

describe('at most once per month', () => {
  it('running again for the same month sends nothing more', async () => {
    const shop = await newShop();
    const s = spy();
    await run(s);
    const again = await run(s);
    expect(s.to(shop)).toHaveLength(1);
    expect(again.alreadyDone).toBeGreaterThanOrEqual(1);
  });

  it('two runs at the same moment still send once (the claim is atomic)', async () => {
    const shop = await newShop();
    const s = spy('spy', async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { messageId: 'x' };
    });
    await Promise.all([run(s), run(s)]);
    expect(s.to(shop)).toHaveLength(1);
  });

  it('the next month is a new report', async () => {
    const shop = await newShop();
    const s = spy();
    await run(s);
    await run(s, { now: MAR_RUN });
    expect(s.to(shop)).toHaveLength(2);
    expect(s.to(shop)[1]!.bodyParams[1]).toBe('March 2026');
    expect(await row(shop, '2026-03')).toMatchObject({ status: 'sent' });
  });
});

describe('failures', () => {
  it('a temporary failure is retried on the next run, and succeeds', async () => {
    const shop = await newShop();
    const flaky = spy('spy', (_m, call) => {
      if (call === 1) throw new WhatsAppError('503 from Meta', true, 503);
      return { messageId: 'wamid.later' };
    });
    const first = await run(flaky);
    expect(first.failed).toBeGreaterThanOrEqual(1);
    expect(await row(shop)).toMatchObject({ status: 'failed', attempts: 1 });
    expect((await row(shop))?.lastError).toContain('503');

    await run(flaky);
    expect(await row(shop)).toMatchObject({ status: 'sent', attempts: 2, providerMessageId: 'wamid.later', lastError: null });
  });

  it(`gives up after ${MAX_ATTEMPTS} attempts instead of messaging forever`, async () => {
    const shop = await newShop();
    const down = spy('spy', () => {
      throw new WhatsAppError('outage', true, 500);
    });
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await run(down);
    expect(down.to(shop)).toHaveLength(MAX_ATTEMPTS);
    expect(await row(shop)).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
  });

  it('a permanent failure (bad number, unapproved template) is never retried', async () => {
    const shop = await newShop();
    const bad = spy('spy', () => {
      throw new WhatsAppError('Message undeliverable', false, 400, 131026);
    });
    await run(bad);
    await run(bad);
    expect(bad.to(shop)).toHaveLength(1);
    expect(await row(shop)).toMatchObject({ status: 'failed_permanent', attempts: 1 });
  });

  it("one shop's failure does not stop the others", async () => {
    const bad = await newShop();
    const good = await newShop();
    const s = spy('spy', (m) => {
      if (m.to === bad.digits) throw new WhatsAppError('nope', false, 400);
      return { messageId: 'ok' };
    });
    await run(s);
    expect(await row(bad)).toMatchObject({ status: 'failed_permanent' });
    expect(await row(good)).toMatchObject({ status: 'sent' });
  });
});

describe('dry run', () => {
  it('previews the message for each shop but sends nothing and records nothing', async () => {
    const shop = await newShop();
    const s = spy();
    const summary = await run(s, { dryRun: true });
    const mine = summary.dryRun.find((d) => d.tenantId === shop.tenantId);
    expect(mine).toMatchObject({ to: shop.digits });
    expect(mine?.preview).toContain(`report for ${shop.name}`);
    expect(s.calls).toHaveLength(0);
    expect(await row(shop)).toBeUndefined();

    await run(s);
    expect(s.to(shop)).toHaveLength(1);
  });
});

describe('dev run then go live', () => {
  it('a month "sent" by the console driver is sent for real once a real driver runs', async () => {
    const shop = await newShop();
    const consoleDriver = spy('console');
    await run(consoleDriver);
    expect(await row(shop)).toMatchObject({ status: 'sent', provider: 'console' });
    await run(consoleDriver);
    expect(consoleDriver.to(shop)).toHaveLength(1);

    const meta = spy('meta');
    await run(meta);
    expect(meta.to(shop)).toHaveLength(1);
    expect(await row(shop)).toMatchObject({ status: 'sent', provider: 'meta' });

    await run(meta);
    expect(meta.to(shop)).toHaveLength(1);
  });
});

describe('database guarantees', () => {
  it('a merchant connection cannot write delivery rows, and sees only its own', async () => {
    const a = await newShop();
    const b = await newShop();
    await run(spy());

    await expect(
      appDb().insert(schema.reportDeliveries).values({ tenantId: a.tenantId, period: '2026-01', status: 'sent' }),
    ).rejects.toThrow();
    await expect(
      withTenant(a.tenantId, ({ tx }) =>
        tx.update(schema.reportDeliveries).set({ status: 'failed' }).where(eq(schema.reportDeliveries.tenantId, a.tenantId)),
      ),
    ).rejects.toThrow();

    const seenByA = await withTenant(a.tenantId, ({ tx }) => tx.select().from(schema.reportDeliveries));
    expect(seenByA.length).toBeGreaterThan(0);
    expect(seenByA.every((r) => r.tenantId === a.tenantId)).toBe(true);
    expect(seenByA.some((r) => r.tenantId === b.tenantId)).toBe(false);
  });

  it('rejects a malformed period or an unknown status', async () => {
    const shop = await newShop();
    await expect(
      withSystem(({ tx }) => tx.insert(schema.reportDeliveries).values({ tenantId: shop.tenantId, period: '2026-13', status: 'sent' })),
    ).rejects.toThrow();
    await expect(
      withSystem(({ tx }) => tx.insert(schema.reportDeliveries).values({ tenantId: shop.tenantId, period: '2026-05', status: 'delivered' })),
    ).rejects.toThrow();
  });
});

vi.setConfig({ testTimeout: 60_000 });
