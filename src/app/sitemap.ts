import type { MetadataRoute } from 'next';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { withSystem } from '@/modules/tenancy';
import { schema } from '@/modules/db/client';
import { env } from '@/modules/core/env';

export const revalidate = 3600;

/**
 * Every published, active merchant's canonical URL. QR scanning is the
 * primary V1 acquisition path (docs/02 §31), but a merchant page should still
 * be discoverable through search once it exists.
 */
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
