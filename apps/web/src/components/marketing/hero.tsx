import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { Container } from '@/components/marketing/container';
import {
  ALL_CORNERS,
  BOTTOM_CORNERS,
  Marks,
} from '@/components/marketing/marks';
import {
  TILE,
  TILE_COLUMNS,
  TILE_FILL,
  TILE_MASK,
  TILE_MASK_MIRRORED,
} from '@/components/marketing/tiles';

/**
 * The hero's opening statement.
 *
 * Anatomy follows the layout study of a dark fintech landing page, translated
 * into Harbor Amber's light theme: a micro badge with a plus mark at each corner,
 * a two-line headline carrying exactly one amber word, one centred sentence, and
 * a single dominant action. Everything shares one centre axis and one narrow
 * measure — 56px of type on a 1200px-wide page needs a short line length or it
 * stops scanning.
 *
 * The hero is divided into two parts, top and bottom:
 *
 *  - **Top** is the three-column row, split by **percentage** — 20% / 60% / 20%
 *    of the viewport, not by the page `Container`. The middle column carries the
 *    badge strip, the headline and the CTA inside the vertical hairlines that
 *    frame them; the two side columns carry the tile fields. The hero is
 *    deliberately its own composition — the split does not track the text column
 *    of the sections below it. The square fields live in the top part only — that
 *    is the part that is divided in three.
 *  - **Bottom** is the product band: the backdrop video, full-bleed and muted,
 *    with the issues-board screenshot in the container column on top of it — the
 *    screenshot gives the band its height (its own aspect ratio, no fixed
 *    window). No rule between the two parts.
 *
 * The copy is a proposal, not a decision: the badge carries the two facts worth
 * stating before the headline, and the headline is deliberately the product's
 * promise in the second person rather than a claim about the competition.
 */
export function Hero() {
  return (
    <section className="flex flex-col border-t border-ds-border">
      {/* Top part — the three-column row. `items-stretch` makes the side columns
          exactly as tall as the middle one, so the vertical hairlines and the
          square fields span the whole band between its top and bottom rules. */}
      <div className="flex items-stretch border-b border-ds-border">
        <SquarePattern side="left" />

        <div className="relative flex w-3/5 shrink-0 flex-col border-x border-ds-border text-center">
          {/* The badge is a strip across the top of the column — the column has no
            gutters, so the strip spans it edge to edge, its text stays centred,
            and its corner marks land on the strip's own corners. A top-down grey
            wash (4.5% of the text colour, so it works in both themes) separates
            the strip from the flat page background below it without reading as a
            filled surface. */}
          <div className="relative flex items-center justify-center border-b border-ds-border bg-gradient-to-b from-ds-text/[0.045] to-transparent py-3">
            <Marks corners={ALL_CORNERS} className={MARK_STACKING} />
            <span className="font-mono text-[11px] font-semibold tracking-[1.2px] text-ds-text-muted uppercase">
              Open source · Self-hostable
            </span>
          </div>

          <div className="flex flex-col items-center py-28">
            <h1 className="flex flex-col text-[56px] leading-[1.05] font-bold tracking-[-1.2px] text-ds-text">
              <span>You build the software.</span>
              <span>
                We keep the work{' '}
                <span className="text-ds-brand">organized</span>.
              </span>
            </h1>

            <p className="mt-8 max-w-[560px] text-base leading-relaxed text-ds-text-muted">
              Project management for small engineering teams — projects, cycles,
              issues and activity in one place, without the enterprise
              machinery.
            </p>

            <Button size="lg" asChild className="mt-8">
              <a href="/sign-up">Start a workspace</a>
            </Button>
          </div>

          {/* The middle column's vertical rules end on the rule that closes the
              top part — the same plus marks that pin the badge mark each end. */}
          <Marks corners={BOTTOM_CORNERS} className={MARK_STACKING} />
        </div>

        <SquarePattern side="right" />
      </div>

      {/* Bottom part — the product band: the backdrop video runs full-bleed
          behind everything, and the issues-board screenshot sits in the container
          column on top of it. The screenshot sets the band's height now, so the
          band is as tall as its own aspect ratio needs — there is no fixed
          window any more. The product cards, if any, come on top of the shot. */}
      <div className="relative">
        <video
          src="/hero-video.mp4"
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* The product shot sits in the shared `Container` (1440px), which is
            what gives the band its width — the video frames it top and bottom. */}
        <Container className="relative py-16">
          <Image
            src="/hero-product-mockup.png"
            alt="The Shipyard issues board"
            width={3600}
            height={2025}
            priority
            sizes="(min-width: 1504px) 1440px, 100vw"
            className="h-auto w-full"
          />
        </Container>
      </div>
    </section>
  );
}

/**
 * The hero's mark stacking (`components/marketing/marks.tsx`). The mark must sit
 * above the bar's layer (`z-50` against the header's `z-40`): the line under the
 * bar is the hero's own top border, and the crossing half would otherwise be
 * hidden behind the header — which is what makes the marks look clipped. It
 * drops behind the bar (`z-30`) as soon as the bar takes over the line on
 * scroll, so the marks stay on whichever line is actually drawn.
 */
const MARK_STACKING = 'z-50 [html[data-scrolled=true]_&]:z-30';

/**
 * The tile field in each side column, edge to edge.
 *
 * Painted on the column itself — a translucent background colour masked by the
 * shared tile mask (`components/marketing/tiles.ts`) — so there are no nodes to
 * place and the colour stays a theme token. The left field is the right one
 * **mirrored**: its mask reflects the grey cells and the phase hangs off its
 * inner edge, so the pair reads as one symmetric arrangement either side of the
 * centre column rather than the same pattern twice. The column is a fixed 20% of
 * the row, so the field is present at every width.
 */
function SquarePattern({ side }: { side: 'left' | 'right' }) {
  return (
    <div
      aria-hidden
      className="w-1/5 shrink-0"
      style={{
        backgroundColor: TILE_FILL,
        maskImage: side === 'left' ? TILE_MASK_MIRRORED : TILE_MASK,
        maskSize: `${TILE * TILE_COLUMNS}px ${TILE * TILE_COLUMNS}px`,
        maskPosition: side === 'left' ? 'right top' : 'left top',
      }}
    />
  );
}
