import Image from 'next/image';
import Link from 'next/link';
import { Fragment } from 'react';

import { MarketingActions } from '@/components/marketing/marketing-actions';

/**
 * Canonical public repository link — the marketing surface's "open source"
 * destination. Kept here rather than inlined so the header, the footer and the
 * landing page sections all point at one string.
 */
export const REPOSITORY_URL = 'https://github.com/YONATANEMEKETE/shipyard';

/**
 * Centre of the header. Deliberately short: only pages that exist. A "Product"
 * dropdown would be a fake affordance until there is more than one product page
 * to point at.
 */
const NAV_LINKS = [
  { label: 'Changelog', href: '/changelog' },
  { label: 'GitHub', href: REPOSITORY_URL, external: true },
] as const;

/**
 * Marketing site header for the public surface (`/`, `/changelog`).
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
 * The bar is full-bleed: its background, rule and content all run edge to edge
 * with the page gutters, so the header is a band across the viewport rather than
 * a box inside the `Container` column. Sections below it still use `Container`,
 * which means the header's content and the hero copy do not share a left edge at
 * wide viewports — that is the intended trade of a full-width bar.
 *
 * `public/app-icon.png` is the mark: it already carries its own amber container
 * and corner radius, so it sits directly on the canvas without a wrapper.
 *
 * This stays a server component; only the actions are a client island, so the
 * rest of the bar ships no JavaScript. Motion (the reference dims the bar as the
 * page scrolls) is an implementation-time concern, not a layout one.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-ds-border bg-ds-bg">
      <div className="flex h-[72px] w-full items-center px-4 sm:px-6 lg:px-8">
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
              {'external' in link ? (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-ds-text-muted transition-colors hover:text-ds-text"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  href={link.href}
                  className="text-sm font-medium text-ds-text-muted transition-colors hover:text-ds-text"
                >
                  {link.label}
                </Link>
              )}
            </Fragment>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2">
          <MarketingActions />
        </div>
      </div>
    </header>
  );
}
