import type { CycleStatus } from '@shipyard/shared';

import { cn } from '@/lib/utils';

/**
 * Reusable cycle status badge — the "Status Chip" from shipyard.pen
 * (Cycles Detail header, and the same chip the lifecycle list will use):
 * a 6px dot + label in a pill.
 *
 * Colors match the design's per-status treatment, expressed as tokens:
 *  - Planned   → warning (amber)
 *  - Active    → info (blue)
 *  - Completed → success (green)
 *
 * Status only ever changes through a lifecycle action (spec D2), so this is a
 * read-only indicator — there is no interactive variant by design.
 */

const STATUS_BADGE_STYLES: Record<
  CycleStatus,
  { label: string; className: string; dot: string }
> = {
  PLANNED: {
    label: 'Planned',
    className: 'bg-ds-warning-soft text-ds-warning',
    dot: 'bg-ds-warning',
  },
  ACTIVE: {
    label: 'Active',
    className: 'bg-ds-info-soft text-ds-info',
    dot: 'bg-ds-info',
  },
  COMPLETED: {
    label: 'Completed',
    className: 'bg-ds-success-soft text-ds-success',
    dot: 'bg-ds-success',
  },
};

export interface CycleStatusBadgeProps {
  status: CycleStatus;
  /** Override the status's default colors for contextual variants. */
  className?: string;
}

export function CycleStatusBadge({ status, className }: CycleStatusBadgeProps) {
  const style = STATUS_BADGE_STYLES[status];

  return (
    <span
      className={cn(
        'inline-flex h-[22px] w-fit shrink-0 items-center justify-center gap-1.5 rounded-full border border-transparent px-2.5 text-[11px] font-semibold',
        style.className,
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  );
}
