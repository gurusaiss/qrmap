import type { MetadataRoute } from 'next';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { withSystem } from '@/modules/tenancy';
import { schema } from '@/modules/db/client';
import { env } from '@/modules/core/env';

/**
 * Computed at request time, not build time: it reads PUBLIC_QR_ORIGIN and
 * queries the live database for published merchants, neither of which a
 * container build step has access to (no .env file, no DB network access
 * during `docker build`). Previously `revalidate = 3600` assumed build-time
 * env/DB access was available, which broke the first containerized deploy.
 *
 * Every published, active merchant's canonical URL. QR scanning is the
 * primary V1 acquisition path (docs/02 §31), but a merchant page should still
 * be discoverable through search once it exists.
 */
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = env().PUBLIC_QR_ORIGIN;

  const rows = await withSystem(({ tx }) =>
    tx
      .select({ slug: schema.merchantSlugs.slug, updatedAt: schema.tenants.updatedAt })
      .from(schema.tenants)
      .innerJoin(
        schema.merchantSlugs,
        and(eq(schema.merchantSlugs.tenantId, schema.tenants.id), eq(schema.merchantSlugs.isPrimary, true)),
      )
      .where(
        and(
          eq(schema.tenants.status, 'active'),
          isNotNull(schema.tenants.publishedAt),
          isNull(schema.tenants.deletedAt),
        ),
      )
      .limit(50_000),
  );

  return rows.map((row) => ({
    url: `${origin}/m/${row.slug}`,
    lastModified: row.updatedAt,
    changeFrequency: 'daily' as const,
  }));
}
