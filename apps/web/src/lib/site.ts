/**
 * The site's own identity, in one place.
 *
 * Every absolute URL the app emits — Open Graph images, canonicals, the
 * sitemap — resolves against `SITE_URL`, so moving the domain (or serving a
 * preview deploy) is a single edit here.
 *
 * A constant rather than an env var: the public identity of the site is the
 * same in every environment, and `NEXT_PUBLIC_*` values are inlined at build
 * time, which turns one more variable into one more way a deploy can quietly
 * differ from what was reviewed. Same rule as `./assets.ts`.
 *
 * Copy is the product's existing wording, not new marketing: the landing page
 * and the app sit under one name and one description.
 */
export const SITE_URL = 'https://shipyard.yonatanem.com';

export const SITE_NAME = 'Shipyard';

export const SITE_TAGLINE = 'Plan. Build. Ship.';

export const SITE_DESCRIPTION =
  'Shipyard is a focused project-management product. Plan, build, and ship with calm, dependable precision.';

/** Matches `<html lang>` in `app/layout.tsx`. */
export const SITE_LANG = 'en';

/** `og:locale` — Open Graph's format, not a BCP-47 tag. */
export const SITE_LOCALE = 'en_US';

/**
 * The author's X profile. One string, two consumers: the marketing header's
 * nav (`components/marketing/site-header.tsx` re-exports it as `X_URL`) and the
 * `twitter:site` / `twitter:creator` card tags. The handle is the URL's last
 * segment — X's card tags want `@handle`, not a link.
 */
export const SITE_X_URL = 'https://x.com/Yonatanem2';

export const SITE_X_HANDLE = '@Yonatanem2';

/**
 * Routes that have no business in a search result: the app itself, the
 * credential pages, and anything carrying a token.
 *
 * One list, two consumers, because a `robots.txt` disallow alone is not enough
 * — a disallowed URL is still indexable when something links to it, and four of
 * these routes are client components (`'use client'`), which cannot export
 * `metadata`. So the second layer is the `X-Robots-Tag` response header from
 * `next.config.ts`, and the two must agree or the weaker one wins.
 */
export const NOINDEX_PATHS = [
  '/w',
  '/onboarding',
  '/select-workspace',
  '/settings',
  '/invite',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/error',
] as const;

/**
 * The social card. 1200×630 is the one size every platform crops from.
 *
 * Wired into both `openGraph` and `twitter` from the root layout: one card for
 * the whole site, since the product is the pitch and the board is the proof.
 */
export const SITE_OG_IMAGE = {
  url: '/og-image.png',
  width: 1200,
  height: 630,
  alt: 'The Shipyard landing page — “You build the software. We keep the work organized.” — above a screenshot of the issues board.',
} as const;

/** Absolute form of a path within this site, for metadata and crawler files. */
export function siteUrl(path = '/'): string {
  return new URL(path, SITE_URL).toString();
}
