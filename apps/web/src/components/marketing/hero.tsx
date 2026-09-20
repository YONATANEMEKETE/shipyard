import Image from 'next/image';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Container } from '@/components/marketing/container';

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
            <Marks corners={BADGE_CORNERS} />
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
          <Marks corners={RULE_END_MARKS} />
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
 * A single plus mark — the hero's line-crossing motif. Decorative, so it is
 * hidden from assistive technology; it straddles whatever line it is placed on
 * by pairing its offset with its transform. The mark sits above the bar's
 * stacking order (`z-50` against the header's `z-40`) because the line under the
 * bar is the hero's own top border — the crossing half would otherwise be hidden
 * behind the header, which is what makes them look clipped — and it drops behind
 * the bar (`z-30`) as soon as the bar takes over the line.
 */
function PlusMark({ position, shift }: { position: string; shift: string }) {
  return (
    <Plus
      aria-hidden
      className={`absolute ${position} ${shift} z-50 size-2.5 text-ds-brand [html[data-scrolled=true]_&]:z-30`}
      strokeWidth={1.5}
    />
  );
}

type Mark = { position: string; shift: string };

/** The four marks pinning the badge strip's corners. */
const BADGE_CORNERS = [
  { position: 'top-0 left-0', shift: '-translate-x-1/2 -translate-y-1/2' },
  { position: 'top-0 right-0', shift: 'translate-x-1/2 -translate-y-1/2' },
  { position: 'bottom-0 left-0', shift: '-translate-x-1/2 translate-y-1/2' },
  { position: 'bottom-0 right-0', shift: 'translate-x-1/2 translate-y-1/2' },
] as const satisfies readonly Mark[];

/**
 * The pair at the bottom ends of the middle column's vertical rules, where they
 * meet the rule that closes the top part.
 */
const RULE_END_MARKS = [
  { position: 'bottom-0 left-0', shift: '-translate-x-1/2 translate-y-1/2' },
  { position: 'bottom-0 right-0', shift: 'translate-x-1/2 translate-y-1/2' },
] as const satisfies readonly Mark[];

/** Renders a set of plus marks inside a `relative` parent. */
function Marks({ corners }: { corners: readonly Mark[] }) {
  return (
    <>
      {corners.map(({ position, shift }) => (
        <PlusMark key={position} position={position} shift={shift} />
      ))}
    </>
  );
}

/**
 * The faint tile field in each side column, edge to edge.
 *
 * Reference (Ledger): the side margins are tiled with square cells — no gaps and
 * no padding — where only some cells carry a low-opacity grey and the rest are
 * exactly the page background. Ours: 92px cells at 15% of `--ds-border-strong`,
 * with the grey set a deliberate scatter — the `GREY_CELLS` below, two per row in
 * a 6×6 tile, none orthogonally adjacent to another (including across the tile
 * seam) — so nothing about it reads as a grid or a checkerboard.
 *
 * Painted on the column itself: a translucent background colour masked by the
 * SVG tile, so there are no nodes to place, the tiling fills whatever height the
 * top part has, and the colour stays a theme token — the mask carries no colour
 * of its own. The left field is the right one **mirrored** — its mask reflects
 * the grey cells (column `c` → `5 − c`) and the phase hangs off its inner edge —
 * so the pair reads as one symmetric arrangement either side of the centre column
 * rather than the same pattern twice. The column is a fixed 20% of the row — the
 * field is present at every width, and it is the middle column's percentage that
 * keeps the hero's composition stable as the viewport changes.
 */
const TILE = 92;
const TILE_COLUMNS = 6;
// [row, column] of each grey cell inside one 6×6 tile of the mask.
const GREY_CELLS: Array<[number, number]> = [
  [0, 1],
  [0, 4],
  [1, 0],
  [1, 3],
  [2, 1],
  [2, 5],
  [3, 2],
  [3, 4],
  [4, 1],
  [4, 3],
  [5, 0],
];

const tileMask = (cells: Array<[number, number]>) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE * TILE_COLUMNS}" height="${TILE * TILE_COLUMNS}"><g fill="#fff">${cells
      .map(
        ([row, col]) =>
          `<rect x="${col * TILE}" y="${row * TILE}" width="${TILE}" height="${TILE}"/>`,
      )
      .join('')}</g></svg>`,
  )}")`;

const TILE_MASK = tileMask(GREY_CELLS);
const TILE_MASK_MIRRORED = tileMask(
  GREY_CELLS.map(([row, col]) => [row, TILE_COLUMNS - 1 - col]),
);

function SquarePattern({ side }: { side: 'left' | 'right' }) {
  return (
    <div
      aria-hidden
      className="w-1/5 shrink-0"
      style={{
        backgroundColor:
          'color-mix(in oklab, var(--ds-border-strong) 15%, transparent)',
        maskImage: side === 'left' ? TILE_MASK_MIRRORED : TILE_MASK,
        maskSize: `${TILE * TILE_COLUMNS}px ${TILE * TILE_COLUMNS}px`,
        maskPosition: side === 'left' ? 'right top' : 'left top',
      }}
    />
  );
}
