import Link from 'next/link';

import { PrecisionLoopMark } from '@/components/auth/precision-loop-mark';
import { Container } from '@/components/marketing/container';
import { REPOSITORY_URL } from '@/components/marketing/site-header';

/**
 * Marketing site footer for the public surface (`/`, `/changelog`).
 *
 * PLACEHOLDER: structure only — designed in `shipyard-design/03-UI/shipyard.pen`
 * before this is styled for real.
 *
 * Deliberately absent for now: a license line and privacy/terms links. The
 * repository has no `LICENSE` file yet and the legal pages do not exist, and
 * the landing page claims "open source" — so both are prerequisites of the
 * marketing release, not decoration (see the build-phase checklist in
 * `(marketing)/page.tsx`).
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-ds-border bg-ds-bg">
      <Container className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-ds-text-muted">
          <PrecisionLoopMark className="size-4 text-ds-brand" />
          <span className="text-sm">
            Shipyard — <span className="text-ds-text">Plan. Build. Ship.</span>
          </span>
        </div>

        <nav
          className="flex items-center gap-4 text-sm sm:gap-6"
          aria-label="Footer"
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
        </nav>
      </Container>
    </footer>
  );
}
