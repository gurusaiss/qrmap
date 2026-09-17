import type { MetadataRoute } from 'next';
import { env } from '@/modules/core/env';

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
