'use client';

import { useEffect } from 'react';

/**
 * The last resort — `app/global-error.tsx`.
 *
 * This is the boundary for a throw in the root layout itself: the theme
 * provider, the query client, the toast stack. Everything the other two
 * boundaries lean on is gone, and Next replaces the whole document, so this file
 * has to be genuinely self-sufficient. Three consequences, all of them
 * deliberate:
 *
 *  - **No Tailwind, no design-system classes.** Next docs: `global-error` and
 *    the built-in 500 page render their own document and do not include your
 *    global styles. Utilities live in `globals.css`, which is imported by the
 *    layout that just failed. So the handful of rules below are plain CSS, and
 *    the palette is written out longhand — the Harbor Amber values the tokens
 *    resolve to, not the tokens (`var(--ds-bg)` is not defined here).
 *  - **The theme class is restored by hand.** next-themes writes the theme as a
 *    class on `<html>`, and that layout is the thing that is broken. The media
 *    query gives the OS preference for the first paint; the effect then applies
 *    the reader's stored choice, matching the same `theme` key the provider uses
 *    (`system` and "nothing stored" both leave the media query standing).
 *  - **The font is the system stack.** Inter arrives as `--font-sans` on the
 *    `<html>` the root layout renders, which is also gone — a last-resort screen
 *    is not the place to re-load webfonts. It falls back to the same stack the
 *    design system names after Inter, so the shape of the page is unchanged.
 *
 * `<title>` is rendered instead of exporting `metadata`: metadata exports are not
 * supported in error boundaries, and React hoists the element into the head.
 *
 * Copy stays in the third person of the other two boundaries — this screen broke,
 * nothing of yours was lost — plus the one action that can actually help here:
 * the retry, and a plain link home for when it cannot. `error.digest` is shown
 * when the build produced one, since that hash is the only handle on the
 * server-side log for this throw.
 */
const PALETTE = `
  :root {
    --ge-bg: #f4f3ef;
    --ge-surface: #ffffff;
    --ge-text: #171717;
    --ge-muted: #6c6861;
    --ge-border: #dedcd5;
    --ge-brand: #b45309;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ge-bg: #161512;
      --ge-surface: #1b1916;
      --ge-text: #f7f4ed;
      --ge-muted: #aaa39a;
      --ge-border: #332513;
      --ge-brand: #f59e0b;
    }
  }
  [data-theme='light'] {
    --ge-bg: #f4f3ef;
    --ge-surface: #ffffff;
    --ge-text: #171717;
    --ge-muted: #6c6861;
    --ge-border: #dedcd5;
    --ge-brand: #b45309;
  }
  [data-theme='dark'] {
    --ge-bg: #161512;
    --ge-surface: #1b1916;
    --ge-text: #f7f4ed;
    --ge-muted: #aaa39a;
    --ge-border: #332513;
    --ge-brand: #f59e0b;
  }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--ge-bg);
    color: var(--ge-text);
    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI',
      Roboto, 'Helvetica Neue', Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .ge-wrap {
    display: flex;
    min-height: 100dvh;
    align-items: center;
    justify-content: center;
    padding: 40px 24px;
  }
  .ge-panel { width: 100%; max-width: 520px; }
  .ge-chip {
    display: inline-block;
    padding: 6px 10px;
    border: 1px solid var(--ge-border);
    color: var(--ge-muted);
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
  }
  .ge-title {
    margin: 28px 0 0;
    font-size: clamp(28px, 6vw, 40px);
    line-height: 1.1;
    font-weight: 700;
    letter-spacing: -0.8px;
    text-wrap: balance;
  }
  .ge-body {
    margin: 20px 0 0;
    font-size: 15px;
    line-height: 1.6;
    color: var(--ge-muted);
  }
  .ge-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px; }
  .ge-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 44px;
    padding: 0 24px;
    border-radius: 8px;
    border: 1px solid transparent;
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
  }
  .ge-button-primary {
    background: var(--ge-brand);
    border-color: var(--ge-brand);
    color: #ffffff;
  }
  .ge-button-secondary {
    background: var(--ge-surface);
    border-color: var(--ge-border);
    color: var(--ge-text);
  }
  .ge-reference {
    margin: 28px 0 0;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--ge-muted);
  }
`;

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);

    // Restore the reader's theme choice onto the document this file owns. An
    // explicit choice is applied; `system` (and nothing stored) leaves the media
    // query above in charge, which is what it is there for.
    const stored = window.localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.dataset.theme = stored;
    }
  }, [error]);

  return (
    <html lang="en">
      <body>
        <title>Something went wrong — Shipyard</title>
        <style>{PALETTE}</style>

        <div className="ge-wrap">
          <div className="ge-panel">
            <span className="ge-chip">Unexpected error</span>

            <h1 className="ge-title">Something broke on this screen</h1>

            <p className="ge-body">
              The app failed while rendering, and nothing you did caused it. Try
              again — if it keeps happening, reload the page.
            </p>

            <div className="ge-actions">
              <button
                type="button"
                className="ge-button ge-button-primary"
                onClick={() => retry()}
              >
                Try again
              </button>
              {/* A plain anchor, not `next/link`, on purpose: the router context
                  is part of the app this boundary exists because it failed, and
                  a hard document navigation to `/` is the one exit that cannot
                  fail the same way. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a className="ge-button ge-button-secondary" href="/">
                Back to the home page
              </a>
            </div>

            {error.digest ? (
              <p className="ge-reference">Reference {error.digest}</p>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
