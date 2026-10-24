import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Private areas are also protected by sign-in and marked noindex; robots.txt only saves crawl budget.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/candidate/', '/institute/', '/account', '/invoice/', '/offer/', '/scraper', '/api/', '/verify-email', '/reset-password'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
