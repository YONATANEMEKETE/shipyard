import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Container } from '@/components/marketing/container';
import { ALL_CORNERS, Marks } from '@/components/marketing/marks';
import { NOISE_BACKGROUND } from '@/components/marketing/noise';
import { SiteHeader } from '@/components/marketing/site-header';

/**
 * The application's 404 — `app/not-found.tsx`, the root of the route tree.
 *
 * Two things land here, and they are the reason this file sits at the root
 * rather than in a route group:
 *
 *  - **any URL no route matches.** The marketing shell owns `/` and
 *    `/changelog`; the auth shell owns the credential pages; the workspace shell
 *    owns `/w/*`. A typo'd or stale link matches none of them, and without this
 *    file Next renders its own bare page — centred text, no brand, nothing to
 *    click. This is the page a mistyped URL lands on, so it carries the brand and
 *    a way home.
 *  - **any `notFound()` with no closer boundary.** `/w/:slug` throws it from the
 *    workspace gate and has its own `not-found.tsx` for that; every other caller
 *    anywhere in the tree resolves to this one.
 *
 * It renders *inside* the root layout, so the fonts, the theme and the providers
 * are all in place — but no header is, since those belong to the route groups
 * below it. So it wears the real `SiteHeader`: the same bar, the same nav and the
 * same session-aware actions as the landing page (a visitor who typed the URL
 * wrong is exactly the visitor who needs "Get started" or the way back to their
 * workspace). A brand-only bar was tried first and read as a broken header —
 * lockup on the left, an empty action column on the right.
 *
 * The header is drawn here to the same rule the landing page keeps: at rest it
 * draws no bottom rule, because the line under the bar belongs to the first
 * section, and the bar only takes it over on scroll. The hero supplies that line
 * on `/`; here `main` does, with its own top border.
 *
 * A Server Component, and it has to be: Next does not allow client hooks in a
 * `not-found` file, and there is nothing here that needs them — the copy and the
 * two actions are the same for everyone. (The workspace 404 is more specific
 * because it knows which workspace was asked for; this one cannot.)
 *
 * The copy is in the product's own tongue — the board is where issues live — and
 * stays deliberately short: a 404 is a dead end, and the job is the way out, not
 * an explanation. The chip reuses the hero's badge device (mono eyebrow, plus
 * marks on its corners) so a lost visitor still recognises the surface.
 *
 * `robots noindex` is not set here: Next injects it for every 404 response.
 */
export const metadata: Metadata = {
  title: 'Page not found',
  description: 'That page does not exist — head back to the home page.',
};

export default function NotFound() {
  return (
    <div
      className="flex min-h-dvh flex-col bg-ds-bg text-ds-text"
      style={{ backgroundImage: NOISE_BACKGROUND }}
    >
      <SiteHeader />

      <main className="flex flex-1 flex-col border-t border-ds-border">
        <Container className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
            {/* The chip: the hero's badge strip, one line and no width. Its corner
                marks straddle its own rules, which is the whole motif — the box is
                `relative` and never clips, or half of each mark would be cut. */}
            <div className="relative border border-ds-border bg-gradient-to-b from-ds-text/[0.045] to-transparent px-5 py-2.5 dark:from-ds-brand/[0.07]">
              <Marks corners={ALL_CORNERS} />
              <span className="font-mono text-[11px] font-semibold tracking-[1.2px] text-ds-text-muted uppercase">
                Error 404
              </span>
            </div>

            <h1 className="mt-8 max-w-[520px] text-[30px] leading-[1.1] font-bold tracking-[-0.6px] text-balance text-ds-text sm:text-[36px] sm:tracking-[-0.8px] md:text-[44px] md:tracking-[-1px]">
              This page isn&apos;t on the board
            </h1>

            <p className="mt-6 max-w-[460px] text-sm leading-6 text-ds-text-muted sm:text-base sm:leading-relaxed">
              The link is broken or the page has moved. Nothing else changed —
              your workspaces are where you left them.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
              <Button size="lg" asChild>
                <Link href="/">Back to the home page</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/w">Go to your workspaces</Link>
              </Button>
            </div>
          </div>
        </Container>
      </main>
    </div>
  );
}
