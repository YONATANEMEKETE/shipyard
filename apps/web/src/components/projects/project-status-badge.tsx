import type { ProjectStatus } from '@shipyard/shared';

import { cn } from '@/lib/utils';

/**
 * Reusable project status badge — the "Status Pill" from shipyard.pen
 * (Projects List card): a colored dot + label. Colors match the design:
 *  - Active    → ds-brand-soft bg, ds-brand dot/label
 *  - Completed → ds-success-soft bg, ds-success dot/label
 *  - Planned   → ds-surface-subtle bg, ds-text-muted dot/label
 * The pill snaps to content; the surrounding cell controls the column width.
 * `className` overrides colors for contextual variants.
 */

const STATUS_BADGE_STYLES: Record<
  ProjectStatus,
  { label: string; className: string; dot: string }
> = {
  ACTIVE: {
    label: 'Active',
    className: 'bg-ds-brand-soft text-ds-brand',
    dot: 'bg-ds-brand',
  },
  COMPLETED: {
    label: 'Completed',
    className: 'bg-ds-success-soft text-ds-success',
    dot: 'bg-ds-success',
  },
  PLANNED: {
    label: 'Planned',
    className: 'bg-ds-surface-subtle text-muted-foreground',
    dot: 'bg-ds-text-muted',
  },
};

export interface ProjectStatusBadgeProps {
  status: ProjectStatus;
  /** Override the status's default colors for contextual variants. */
  className?: string;
}

export function ProjectStatusBadge({
  status,
  className,
}: ProjectStatusBadgeProps) {
  const style = STATUS_BADGE_STYLES[status];

  return (
    <span
      className={cn(
        'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1.5 rounded-full border border-transparent px-2.5 text-[10.5px] font-semibold',
        style.className,
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  );
}
