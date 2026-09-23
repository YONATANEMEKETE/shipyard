'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';

import { Button } from '@/components/ui/button';
import { Container } from '@/components/marketing/container';
import { ALL_CORNERS, Marks } from '@/components/marketing/marks';
import { NOISE_BACKGROUND } from '@/components/marketing/noise';
import { SiteHeader } from '@/components/marketing/site-header';

/**
 * The root error boundary — `app/error.tsx`.
 *
 * It catches what `/w/:slug/error.tsx` cannot: a throw in any of the route
 * groups *outside* a workspace — onboarding, the workspace picker, the invite
 * flow, the auth screens, the marketing pages — and a throw in the workspace
 * shell's own `layout.tsx`, which bubbles up past the workspace boundary because
 * a boundary never catches the layout it sits in.
 *
 * It renders inside the root layout, so the fonts, the theme and the providers
 * are all alive — but it replaces everything below them, the route groups'
 * headers included. Hence the same decision the 404 makes: wear the real
 * `SiteHeader` rather than a bare brand row, so a visitor still has the nav and
 * the session-aware actions while this screen is up. (A crash in the root layout
 * itself — the providers — is `global-error.tsx`'s job; nothing here can run.)
 *
 * A Client Component, and it has to be: React error boundaries are client-only,
 * which also means no `metadata` export here. Nothing in this file needs state
 * beyond the two props, so the boundary stays as small as its job.
 *
 * `<main>` carries the top border the first section normally supplies on the
 * landing page — the header draws no rule at rest — which is the same line the
 * 404 leans on.
 *
 * `retry()` re-renders the segment in a transition; `reset()` is deliberately not
 * used, since it clears the error without re-fetching the data that may have
 * caused it. `error.digest` is shown when present: it is the hash of the
 * server-side log entry for this crash, and the only thing support can match on.
 */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // Report the throw — an error boundary swallowing it is exactly the
    // invisible failure the reporter exists for.
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      className="flex min-h-dvh flex-col bg-ds-bg text-ds-text"
      style={{ backgroundImage: NOISE_BACKGROUND }}
    >
      <SiteHeader />

      <main className="flex flex-1 flex-col border-t border-ds-border">
        <Container className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
            <div className="relative border border-ds-border bg-gradient-to-b from-ds-text/[0.045] to-transparent px-5 py-2.5 dark:from-ds-brand/[0.07]">
              <Marks corners={ALL_CORNERS} />
              <span className="font-mono text-[11px] font-semibold tracking-[1.2px] text-ds-text-muted uppercase">
                Unexpected error
              </span>
            </div>

            <h1 className="mt-8 max-w-[520px] text-[30px] leading-[1.1] font-bold tracking-[-0.6px] text-balance text-ds-text sm:text-[36px] sm:tracking-[-0.8px] md:text-[44px] md:tracking-[-1px]">
              Something broke on this screen
            </h1>

            <p className="mt-6 max-w-[460px] text-sm leading-6 text-ds-text-muted sm:text-base sm:leading-relaxed">
              The page failed while rendering, and nothing you did caused it.
              Try again — if it keeps happening, head home and come back.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
              <Button size="lg" onClick={() => retry()}>
                Try again
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/">Back to the home page</Link>
              </Button>
            </div>

            {error.digest ? (
              <p className="mt-8 font-mono text-[10px] tracking-[0.6px] text-ds-text-muted uppercase">
                Reference {error.digest}
              </p>
            ) : null}
          </div>
        </Container>
      </main>
    </div>
  );
}
