import type { ReactNode } from 'react';

import { NOISE_BACKGROUND } from '@/components/marketing/noise';
import { SiteHeader } from '@/components/marketing/site-header';
import { SmoothScroll } from '@/components/marketing/smooth-scroll';

/**
 * Shell for the public marketing surface — `/` (landing) and `/changelog`.
 *
 * Route group, so it adds no URL segment. `src/proxy.ts` treats `/` and
 * `/(marketing)/*` as public tier 1: no session required, and an authenticated
 * visitor is not redirected away.
 *
 * The shell carries no page metadata on purpose — the root layout already owns
 * the `Shipyard — Plan. Build. Ship.` default and the `%s — Shipyard` template,
 * so each page sets only its own `title`/`description`.
 *
 * The grain is painted here, once, over the page canvas: every section renders
 * transparent, so one background layer covers the whole page from the hero to the
 * footer and no section has to carry it. See `components/marketing/noise.ts`.
 *
 * There is no footer: the landing page ends on its own call to action
 * (`components/marketing/cta.tsx`), and the links a footer would carry — the
 * changelog, the repository and sign-in — are in the header.
 *
 * No product chrome (sidebar, workspace header) belongs here: this is the
 * surface a visitor sees before they have a workspace.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-dvh flex-col bg-ds-bg text-ds-text"
      style={{ backgroundImage: NOISE_BACKGROUND }}
    >
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SmoothScroll />
    </div>
  );
}
