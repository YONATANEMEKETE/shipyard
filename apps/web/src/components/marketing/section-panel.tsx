import type { ReactNode } from 'react';

import { Marks, TOP_CORNERS } from '@/components/marketing/marks';
import {
  TILE,
  TILE_COLUMNS,
  TILE_FILL,
  TILE_MASK,
  TILE_MASK_MIRRORED,
} from '@/components/marketing/tiles';
import { cn } from '@/lib/utils';

/**
 * The panel every landing section opens with: a mono eyebrow, the section's
 * heading, a short paragraph, and the masked tile field filling one side behind
 * a hairline.
 *
 * It carries a hairline and square corners but no surface of its own, so a
 * section opens on the page background and reads as one plane the rules are
 * drawn on. The plus marks pin its top two corners, and because the top rule
 * runs on past those corners while the side rules rise above it, the crossing is
 * drawn rather than only marked. Nothing clips here, so each mark keeps the half
 * that sits outside.
 *
 * `tilesSide` alternates between sections: two panels stacked a screen apart
 * otherwise read as the same panel twice. A left field is the right one mirrored
 * and anchored on its inner edge, the same treatment the hero's left column
 * takes, so the pattern always hangs off the side that meets the copy.
 *
 * `heading` and `body` take nodes because the copy is the section's decision:
 * the heading carries exactly one amber word, and which word that is belongs to
 * whoever writes the sentence.
 */
export function SectionPanel({
  eyebrow,
  heading,
  body,
  tilesSide = 'right',
}: {
  eyebrow: string;
  heading: ReactNode;
  body: ReactNode;
  tilesSide?: 'right' | 'left';
}) {
  const tiles = (
    <div
      aria-hidden
      className={cn(
        'relative min-h-[180px] border-ds-border',
        tilesSide === 'left' ? 'border-r' : 'border-l',
      )}
      style={{
        backgroundColor: TILE_FILL,
        maskImage: tilesSide === 'left' ? TILE_MASK_MIRRORED : TILE_MASK,
        maskSize: `${TILE * TILE_COLUMNS}px ${TILE * TILE_COLUMNS}px`,
        maskPosition: tilesSide === 'left' ? 'right top' : undefined,
      }}
    />
  );

  // With the field on the left, the copy sits against the panel's right edge and
  // reads right-aligned: the constrained blocks are pushed over (`lg:ml-auto`)
  // and the lines hang off that edge. Both are `lg:` only, because below `lg` the
  // field stacks above the copy rather than beside it.
  const rightAligned = tilesSide === 'left';

  const copy = (
    <div className={cn('min-w-0 p-8 sm:p-10', rightAligned && 'lg:text-right')}>
      <p className="font-mono text-[10px] font-semibold tracking-[1.2px] text-ds-text-muted uppercase">
        {eyebrow}
      </p>
      <h2
        className={cn(
          'mt-3 max-w-[520px] text-3xl font-semibold tracking-tight text-balance sm:text-4xl',
          rightAligned && 'lg:ml-auto',
        )}
      >
        {heading}
      </h2>
      <p
        className={cn(
          'mt-4 max-w-[520px] text-sm leading-6 text-ds-text-muted',
          rightAligned && 'lg:ml-auto',
        )}
      >
        {body}
      </p>
    </div>
  );

  return (
    <div
      className={cn(
        'relative grid border border-ds-border',
        tilesSide === 'left'
          ? 'lg:grid-cols-[minmax(280px,38%)_1fr]'
          : 'lg:grid-cols-[1fr_minmax(280px,38%)]',
      )}
    >
      <TopCrossings />
      <Marks corners={TOP_CORNERS} />

      {tilesSide === 'left' ? (
        <>
          {tiles}
          {copy}
        </>
      ) : (
        <>
          {copy}
          {tiles}
        </>
      )}
    </div>
  );
}

/**
 * The crossings at the panel's top corners.
 *
 * The panel's hairline does not turn there: the top rule runs on past the two
 * corners and the side rules rise above it, so each pair crosses exactly where a
 * plus mark sits. The arms are one pixel thick like every other hairline and the
 * same colour, so they read as the same line continuing.
 *
 * They are offset by one pixel (`-top-px`, `-left-px`) because an absolutely
 * positioned box inside a bordered parent is placed against the padding box,
 * which begins just *inside* the border. Without the offset each arm would sit a
 * pixel beside the line it continues and the two would read as a step. The arms
 * are 12px, which stays inside the container's gutter at every breakpoint
 * (16 / 24 / 32px), so they never reach the page's own edge.
 */
function TopCrossings() {
  return (
    <>
      {/* The top rule, running on past the left and right corners. */}
      <span
        aria-hidden
        className="absolute -top-px -left-3 h-px w-3 bg-ds-border"
      />
      <span
        aria-hidden
        className="absolute -top-px -right-3 h-px w-3 bg-ds-border"
      />
      {/* The side rules, rising above it. */}
      <span
        aria-hidden
        className="absolute -top-3 -left-px h-3 w-px bg-ds-border"
      />
      <span
        aria-hidden
        className="absolute -top-3 -right-px h-3 w-px bg-ds-border"
      />
    </>
  );
}
