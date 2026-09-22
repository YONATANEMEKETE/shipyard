'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';

/**
 * The workspace's error boundary — `app/w/[slug]/error.tsx`.
 *
 * Where it sits is the whole point. The sidebar, the workspace header and the
 * content surface are rendered by `layout.tsx` one level up, so a crash inside a
 * page — and here that almost always means a client component mapping API data
 * onto a board, a chart or a history list — replaces the *content* and nothing
 * else. The member keeps their workspace and their navigation, which is the
 * difference between "this screen broke" and "the app broke".
 *
 * What it catches, exactly: throws during render, in lifecycle and in effects,
 * from the page and everything under it. It does **not** catch a throw inside an
 * event handler, a `setTimeout` or an unawaited promise — that is the
 * mutation/toast path — and it does not catch a throw in this segment's own
 * `layout.tsx`, which is `app/error.tsx`'s job.
 *
 * `retry()` re-renders the segment inside a transition, so client state outside
 * this boundary survives (an open command palette or a half-typed comment is not
 * thrown away). `reset()` exists in the same props but only clears the error
 * state without re-fetching — the wrong tool when the data is part of the
 * failure, which is why it is not used here.
 *
 * The copy keeps to the rule the two layers share: a boundary says *this screen
 * broke*, a failed request says *this data did not load* (those are the
 * `ErrorState` panels next to the data they belong to). It leads with the one
 * thing the reader actually wants to know — nothing of theirs was lost — and it
 * shows `error.digest` when the build produced one, because that hash is the only
 * handle on the server-side log for this same throw.
 */
export default function WorkspaceError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // The console is the honest placeholder: nothing collects these yet, and the
    // digest on this line is what ties it to the server's log for the same throw.
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <ErrorState
        title="This screen didn't load"
        description="Something broke while rendering it. Nothing you did was lost — try again, and reload the page if it keeps happening."
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => retry()}>
              Try again
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          </div>
        }
      />

      {error.digest ? (
        <p className="font-mono text-[10px] tracking-[0.6px] text-ds-text-muted uppercase">
          Reference {error.digest}
        </p>
      ) : null}
    </div>
  );
}
