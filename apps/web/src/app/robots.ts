import type { MetadataRoute } from 'next';

import { NOINDEX_PATHS, siteUrl } from '@/lib/site';

/**
 * `robots.txt` — the crawler contract.
 *
 * `Allow: /` then the private prefixes: `Disallow` matches by prefix, so `/w`
 * covers `/w`, `/w/acme`, `/w/acme/issues/12` and everything under them. The
 * list itself lives in `@/lib/site` because the same paths also carry an
 * `X-Robots-Tag: noindex` response header (see `next.config.ts`) — a disallowed
 * URL is still indexable when something links to it, so the two layers have to
 * agree.
 *
 * The `Sitemap:` line is the only discovery hint a crawler needs: `/` is the
 * whole public surface.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [...NOINDEX_PATHS],
    },
    sitemap: siteUrl('/sitemap.xml'),
  };
}
