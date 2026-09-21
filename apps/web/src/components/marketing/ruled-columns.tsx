import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The lower half of a section: a frame whose top edge is the panel's own bottom
 * rule (the one line the two parts share, so the frame carries the other three
 * sides only), split into three equal columns.
 *
 * The columns are told apart by one rule each, a left border on every column but
 * the first, which becomes a top border when they stack on a narrow screen, and
 * by nothing else: no card, no surface, no radius. Each column splits in two,
 * the copy on top under a rule that spans it edge to edge, the column's visual
 * below.
 *
 * The frame owns the rows and each column spans both as a subgrid, so every
 * column's copy sits in the same row 1: the row is as tall as the longest copy,
 * which keeps the rule under it on one straight line across all three instead of
 * stepping down with the text.
 *
 * `background` paints a picture behind the columns. A column standing on one may
 * set a `ring` (a band whose fill is a backdrop blur of that picture) and the
 * `surface` its card wears; a column that sets neither sits on the page's canvas
 * inside a hairline.
 */
export type RuledColumn = {
  /** The mono label, and the React key. */
  eyebrow: string;
  heading: string;
  body: ReactNode;
  visual: ReactNode;
  /** The band around the card: padding plus a backdrop filter, never a margin. */
  ring?: string;
  /** The card's own surface classes. */
  surface?: string;
};

export function RuledColumns({
  columns,
  background,
}: {
  columns: readonly RuledColumn[];
  background?: string;
}) {
  return (
    <div className="border-x border-b border-ds-border">
      <div className="grid md:grid-cols-3 md:grid-rows-[auto_auto]">
        {columns.map((column) => (
          <div
            key={column.eyebrow}
            className="flex min-w-0 flex-col border-t border-ds-border first:border-t-0 md:row-span-2 md:grid md:grid-rows-subgrid md:border-t-0 md:border-l md:first:border-l-0"
          >
            <div className="min-w-0 border-b border-ds-border p-6">
              <p className="font-mono text-[10px] font-semibold tracking-[1.2px] text-ds-text-muted uppercase">
                {column.eyebrow}
              </p>
              <h3 className="mt-3 text-lg font-semibold tracking-tight text-foreground">
                {column.heading}
              </h3>
              <p className="mt-3 text-sm leading-6 text-ds-text-muted">
                {column.body}
              </p>
            </div>

            <div
              className={cn(
                'min-w-0 flex-1 p-3',
                background && 'bg-cover bg-center',
              )}
              style={
                background
                  ? { backgroundImage: `url(${background})` }
                  : undefined
              }
            >
              <div className={cn(column.ring)}>
                <div
                  className={cn(
                    'min-w-0 overflow-hidden rounded-lg p-4',
                    column.surface,
                  )}
                >
                  {column.visual}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
