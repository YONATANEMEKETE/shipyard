import type { NextConfig } from 'next';

import { NOINDEX_PATHS } from './src/lib/site';

// The web app calls the API on its own origin (NEXT_PUBLIC_API_URL) — nothing
// is proxied from this app. See src/lib/api/request.ts and src/lib/auth-client.ts.
const nextConfig: NextConfig = {
  transpilePackages: ['@shipyard/shared'],

  /**
   * `X-Robots-Tag: noindex` on every route that must not be indexed.
   *
   * This is the second half of the crawler contract — `app/robots.ts` carries
   * the `Disallow` list, and the two read the same `NOINDEX_PATHS` so they
   * cannot drift. The header is the layer that actually works here: four of
   * these routes are client components (`'use client'`), and a client component
   * cannot export `metadata`, so a per-route `robots` directive is not available
   * to them. A header also covers responses that are not HTML.
   *
   * Both the bare path and its descendants are listed because a Next `source`
   * is matched exactly — `/w` alone would leave `/w/acme` unfetched-but-indexable.
   */
  async headers() {
    const noindex = [
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ] as const;

    return NOINDEX_PATHS.flatMap((path) => [
      { source: path, headers: [...noindex] },
      { source: `${path}/:path*`, headers: [...noindex] },
    ]);
  },
};

export default nextConfig;
