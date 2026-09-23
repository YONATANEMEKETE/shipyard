import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site';

/**
 * `sitemap.xml` — one entry, because `/` is the whole public surface.
 *
 * `lastModified` is a hand-maintained date rather than `new Date()`: the latter
 * rewrites the file on every deploy, and a `lastmod` that moves without the page
 * changing is what teaches crawlers to ignore `lastmod` altogether. Bump this
 * when the landing page's content changes.
 */
const LANDING_LAST_MODIFIED = '2026-09-22';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl('/'),
      lastModified: LANDING_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
