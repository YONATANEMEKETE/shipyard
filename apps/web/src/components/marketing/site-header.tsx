import Image from 'next/image';
import Link from 'next/link';
import { Fragment } from 'react';

import { HeaderShell } from '@/components/marketing/header-shell';
import { Container } from '@/components/marketing/container';
import { MarketingActions } from '@/components/marketing/marketing-actions';
import { SITE_X_URL } from '@/lib/site';

/**
 * Canonical public repository link — the marketing surface's "open source"
 * destination. Kept here rather than inlined so the header, the footer and the
 * landing page sections all point at one string.
 */
export const REPOSITORY_URL = 'https://github.com/YONATANEMEKETE/shipyard';

/**
 * The author's X profile — the same reasoning as `REPOSITORY_URL`: the header's
 * nav and the closing section's signature point at one string. Defined in
 * `@/lib/site` because the Open Graph card tags need the same account.
 */
export const X_URL = SITE_X_URL;

/**
 * Centre of the header. Deliberately short: the repository and the author's feed.
 */
const NAV_LINKS = [
  { label: 'X', href: X_URL, external: true },
  { label: 'GitHub', href: REPOSITORY_URL, external: true },
] as const;

/**
 * Marketing site header for the public surface (`/`).
 *
 * Structure follows the layout study of a dark fintech landing page: a
 * transparent bar (no background block, no border), mark and wordmark at the
 * left, links dead-centre, and the calls to action at the right. The centre
 * group is mathematically centred rather than optically nudged — the brand and
 * action regions are both `flex-1`, so the links sit on the page's own axis
 * instead of on the axis of whatever space is left over.
 *
 * Reached from the design system: 72px bar, Inter for links and buttons, the
 * Geist wordmark beside the app icon (the same lockup the app sidebar uses),
 * 36px controls at `ds-radius-md` — the marketing page deliberately does not
 * introduce a pill-shaped button the product does not use.
 *
 * The bar is full-bleed (background, rule and hover states run edge to edge) but
 * its **content** sits in the shared `Container`, so the brand, the centre links
 * and the actions line up with the page's content axis.
 *
 * `public/app-icon.png` is the mark: it already carries its own amber container
 * and corner radius, so it sits directly on the canvas without a wrapper.
 *
 * This stays a server component; only the shell (the bar's rule on scroll) and the
 * actions are client islands, so the rest of the bar ships no JavaScript. Motion
 * (the reference dims the bar as the page scrolls) is still an implementation-time
 * concern, not a layout one.
 */
export function SiteHeader() {
  return (
    <HeaderShell>
      <Container className="flex h-[72px] items-center">
        <div className="flex flex-1 items-center">
          <Link
            href="/"
            aria-label="Shipyard — home"
            className="flex items-center gap-2.5"
          >
            <Image
              src="/app-icon.png"
              alt=""
              width={32}
              height={32}
              priority
              className="size-8"
            />
            <span className="text-[18px] font-[650] tracking-[-0.5px] text-ds-text [font-family:var(--font-display)]">
              Shipyard
            </span>
          </Link>
        </div>

        <nav
          aria-label="Marketing"
          className="hidden items-center gap-4 md:flex"
        >
          {NAV_LINKS.map((link, index) => (
            <Fragment key={link.label}>
              {index > 0 ? (
                <span aria-hidden className="h-4 w-px bg-ds-border" />
              ) : null}
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-ds-text-muted transition-colors hover:text-ds-text"
              >
                {link.label}
              </a>
            </Fragment>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2">
          <MarketingActions />
        </div>
      </Container>
    </HeaderShell>
  );
}
