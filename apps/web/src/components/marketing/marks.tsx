import { Plus } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The plus mark: the marketing surface's line-crossing motif.
 *
 * A small amber plus straddles a hairline wherever two rules meet or end: the
 * hero's badge strip and the bottom ends of its centre column, and the top
 * corners of sections below it. It is decorative, hidden from assistive
 * technology, and it is placed by pairing an inset (`position`) with the
 * offset that pushes its centre onto the line (`shift`), so it draws the
 * crossing rather than sitting beside it.
 *
 * Stacking: the marks clear the page's own layer by default (`z-10`). Callers
 * that sit under the sticky header pass the hero's own stacking rules in
 * `className`: the top border of the hero *is* the line under the bar, so those
 * marks rise above it (`z-50`) and drop behind it (`z-30`) once the bar takes the
 * line over on scroll.
 */

/** One mark's place in its parent, and how far it is offset from that place. */
export type Mark = { position: string; shift: string };

/**
 * The four corners of a box, each mark offset so its centre sits on the corner
 * itself: half in, half out.
 */
export const CORNERS = {
  topLeft: {
    position: 'top-0 left-0',
    shift: '-translate-x-1/2 -translate-y-1/2',
  },
  topRight: {
    position: 'top-0 right-0',
    shift: 'translate-x-1/2 -translate-y-1/2',
  },
  bottomLeft: {
    position: 'bottom-0 left-0',
    shift: '-translate-x-1/2 translate-y-1/2',
  },
  bottomRight: {
    position: 'bottom-0 right-0',
    shift: 'translate-x-1/2 translate-y-1/2',
  },
} as const satisfies Record<string, Mark>;

/** All four corners of a box. */
export const ALL_CORNERS: readonly Mark[] = [
  CORNERS.topLeft,
  CORNERS.topRight,
  CORNERS.bottomLeft,
  CORNERS.bottomRight,
];

/** The top two corners only: a rule's own ends. */
export const TOP_CORNERS: readonly Mark[] = [CORNERS.topLeft, CORNERS.topRight];

/** The bottom two corners only: where a vertical rule meets the one below it. */
export const BOTTOM_CORNERS: readonly Mark[] = [
  CORNERS.bottomLeft,
  CORNERS.bottomRight,
];

/**
 * Renders a set of plus marks inside a `relative` parent. The parent must not
 * clip (`overflow-hidden` would cut the half of each mark that crosses the
 * line).
 */
export function Marks({
  corners,
  className,
}: {
  corners: readonly Mark[];
  className?: string;
}) {
  return (
    <>
      {corners.map(({ position, shift }) => (
        <Plus
          key={position}
          aria-hidden
          strokeWidth={1.5}
          className={cn(
            'absolute z-10 size-2.5 text-ds-brand',
            position,
            shift,
            className,
          )}
        />
      ))}
    </>
  );
}
