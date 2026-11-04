/**
 * Sends each opted-in shop its monthly report on WhatsApp.
 *
 * Safe to run every hour: a (shop, month, channel) row in report_deliveries is
 * claimed BEFORE sending, so a month's report goes out at most once however
 * often this runs or crashes. A failure that may clear (outage, rate limit) is
 * retried on later runs, up to MAX_ATTEMPTS; one that will not (bad number,
 * template not approved) is not.
 *
 * CLI: `npm run reports:send -- --dry-run` prints who would get what, sends nothing.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { withSystem } from '../tenancy';
import { closeDb, schema } from '../db/client';
import { env } from '../core/env';
import { monthlyReport } from '../analytics';
import {
  normalizeWhatsAppNumber,
  renderReportPreview,
  reportPeriod,
  reportTemplateParams,
} from './monthly-report';
import { WhatsAppError, whatsAppDriver, type WhatsAppDriver } from './whatsapp';

export const MAX_ATTEMPTS = 3;

export type ReportRunSummary = {
  period: string;
  sent: number;
  failed: number;
  alreadyDone: number;
  noNumber: number;
  dryRun: { tenantId: string; to: string; preview: string }[];
};

/** Where a shop's report goes: the owner's login phone, else the shop's own WhatsApp number. */
export async function reportRecipientFor(tenantId: string): Promise<string | null> {
  return withSystem(async ({ tx }) => {
    const owners = await tx
      .select({ phone: schema.users.phone })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(
        and(
          eq(schema.memberships.tenantId, tenantId),
          eq(schema.memberships.role, 'owner'),
          eq(schema.users.status, 'active'),
        ),
      )
      .orderBy(asc(schema.memberships.createdAt));
    for (const owner of owners) {
      const number = normalizeWhatsAppNumber(owner.phone);
      if (number) return number;
    }

    const [profile] = await tx
      .select({ whatsapp: schema.businessProfiles.whatsapp })
      .from(schema.businessProfiles)
      .where(eq(schema.businessProfiles.tenantId, tenantId))
      .limit(1);
    return normalizeWhatsAppNumber(profile?.whatsapp);
  });
}

/** A 'console' row never reached anyone, so a real driver may claim over it (dev run, then go live). */
async function claim(tenantId: string, period: string, provider: string): Promise<boolean> {
  const rows = await withSystem(({ tx }) =>
    tx.execute(sql`
      INSERT INTO report_deliveries (tenant_id, period, channel, status, attempts, provider)
      VALUES (${tenantId}, ${period}, 'whatsapp', 'sending', 1, ${provider})
      ON CONFLICT (tenant_id, period, channel) DO UPDATE
        SET status = 'sending', attempts = report_deliveries.attempts + 1, provider = ${provider}
        WHERE (report_deliveries.status = 'failed' AND report_deliveries.attempts < ${MAX_ATTEMPTS})
           OR (report_deliveries.provider = 'console' AND ${provider} <> 'console')
      RETURNING id
    `),
  );
  return rows.length > 0;
}

async function finish(
  tenantId: string,
  period: string,
  fields: { status: 'sent' | 'failed' | 'failed_permanent'; providerMessageId?: string | null; lastError?: string | null },
): Promise<void> {
  await withSystem(({ tx }) =>
    tx
      .update(schema.reportDeliveries)
      .set({ status: fields.status, providerMessageId: fields.providerMessageId ?? null, lastError: fields.lastError ?? null })
      .where(
        and(
          eq(schema.reportDeliveries.tenantId, tenantId),
          eq(schema.reportDeliveries.period, period),
          eq(schema.reportDeliveries.channel, 'whatsapp'),
        ),
      ),
  );
}

export async function sendMonthlyReports(
  options: { now?: Date; dryRun?: boolean; driver?: WhatsAppDriver; template?: string; language?: string } = {},
): Promise<ReportRunSummary> {
  const now = options.now ?? new Date();
  const driver = options.driver ?? whatsAppDriver();
  const template = options.template ?? env().WHATSAPP_REPORT_TEMPLATE;
  const language = options.language ?? env().WHATSAPP_TEMPLATE_LANG;
  const period = reportPeriod(now);
  const summary: ReportRunSummary = { period: period.key, sent: 0, failed: 0, alreadyDone: 0, noNumber: 0, dryRun: [] };

  const tenants = await withSystem(({ tx }) =>
    tx
      .select({ tenantId: schema.tenants.id })
      .from(schema.tenants)
      .innerJoin(schema.businessProfiles, eq(schema.businessProfiles.tenantId, schema.tenants.id))
      .where(
        and(
          eq(schema.tenants.status, 'active'),
          sql`${schema.tenants.publishedAt} IS NOT NULL`,
          eq(schema.businessProfiles.monthlyReportWhatsapp, true),
        ),
      )
      .orderBy(asc(schema.tenants.createdAt)),
  );

  for (const { tenantId } of tenants) {
    const to = await reportRecipientFor(tenantId);
    if (!to) {
      summary.noNumber += 1;
      continue;
    }

    if (!options.dryRun && !(await claim(tenantId, period.key, driver.name))) {
      summary.alreadyDone += 1;
      continue;
    }

    try {
      const report = await monthlyReport(tenantId);
      if (!report) throw new WhatsAppError('shop not found', false);
      const bodyParams = reportTemplateParams(report, period.label);

      if (options.dryRun) {
        summary.dryRun.push({ tenantId, to, preview: renderReportPreview(bodyParams) });
        continue;
      }

      const { messageId } = await driver.send({ to, template, language, bodyParams });
      await finish(tenantId, period.key, { status: 'sent', providerMessageId: messageId });
      summary.sent += 1;
    } catch (error) {
      if (options.dryRun) throw error;
      const retryable = error instanceof WhatsAppError ? error.retryable : true;
      await finish(tenantId, period.key, {
        status: retryable ? 'failed' : 'failed_permanent',
        lastError: String(error instanceof Error ? error.message : error).slice(0, 500),
      });
      summary.failed += 1;
    }
  }

  return summary;
}

if (process.argv[1]?.endsWith('send-reports.ts')) {
  const dryRun = process.argv.includes('--dry-run');
  sendMonthlyReports({ dryRun })
    .then((s) => {
      process.stdout.write(`${JSON.stringify(s, null, 2)}\n`);
      return closeDb();
    })
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      process.stderr.write(`report send failed: ${String(error)}\n`);
      process.exit(1);
    });
}
