import Link from 'next/link';

import { PrecisionLoopMark } from '@/components/auth/precision-loop-mark';

/**
 * Canonical public repository link — the marketing surface's "open source"
 * destination. Kept here rather than inlined so the header, the footer and the
 * landing page sections all point at one string.
 */
export const REPOSITORY_URL = 'https://github.com/YONATANEMEKETE/shipyard';

/**
 * Marketing site header for the public surface (`/`, `/changelog`).
 *
 * PLACEHOLDER: structure only. The final header is designed in
 * `shipyard-design/03-UI/shipyard.pen` first; this version exists so the route
 * shell can be reviewed before any pixels are committed to. It is deliberately
 * static — no scroll behaviour, no motion, no client JavaScript — and the CTAs
 * are plain links rather than `components/ui/button` so no client bundle is
 * pulled into the marketing shell until the design is approved.
 *
 * Open question for the build phase: session awareness. `src/proxy.ts` keeps
 * `/` public "even for authed stays", so an authenticated visitor sees the
 * signed-out calls to action. Decide whether the header swaps them for a
 * "Go to your workspace" link (needs a session read) or stays static.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-ds-border bg-ds-bg">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-ds-text">
          <PrecisionLoopMark className="size-5 text-ds-brand" />
          <span className="text-sm font-semibold tracking-tight">Shipyard</span>
        </Link>

        <nav
          className="flex items-center gap-4 text-sm sm:gap-6"
          aria-label="Marketing"
        >
          <Link
            href="/changelog"
            className="text-ds-text-muted transition-colors hover:text-ds-text"
          >
            Changelog
          </Link>
          <a
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
            className="text-ds-text-muted transition-colors hover:text-ds-text"
          >
            GitHub
          </a>
          <Link
            href="/sign-in"
            className="text-ds-text-muted transition-colors hover:text-ds-text"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="text-ds-text underline-offset-4 hover:underline"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
