import type { MetadataRoute } from 'next';
import { env } from '@/modules/core/env';

/**
 * Computed at request time, not build time: it reads PUBLIC_QR_ORIGIN from
 * the real runtime environment, which a container build step does not have
 * access to (no .env file is ever baked into the image).
 */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const origin = env().PUBLIC_QR_ORIGIN;
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/m/'],
        // The dashboard, admin console and API are not content for search
        // engines, and the admin console specifically must never be indexed.
        disallow: ['/app', '/admin', '/login', '/api', '/q'],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
