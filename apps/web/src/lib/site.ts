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
 * Copy is the product's existing wording, not new marketing: the landing
 * page, the changelog and the app all sit under one name and one description.
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
 * The social card. 1200×630 is the one size every platform crops from.
 *
 * Declared here at M1 so the shape and the alt text are reviewable, and wired
 * into `openGraph`/`twitter` where the file itself lands.
 */
export const SITE_OG_IMAGE = {
  url: '/og-image.png',
  width: 1200,
  height: 630,
  alt: 'Shipyard — a project board, and the wordmark.',
} as const;

/** Absolute form of a path within this site, for metadata and crawler files. */
export function siteUrl(path = '/'): string {
  return new URL(path, SITE_URL).toString();
}
