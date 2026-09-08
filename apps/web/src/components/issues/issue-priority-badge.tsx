'use client';

import type { IssuePriority } from '@shipyard/shared';
import { cn } from '@/lib/utils';

const META: Record<
  IssuePriority,
  { label: string; bg: string; text: string; border: string }
> = {
  URGENT: {
    label: 'Urgent',
    bg: 'bg-ds-danger-soft',
    text: 'text-ds-danger',
    border: 'border-ds-danger/15',
  },
  HIGH: {
    label: 'High',
    bg: 'bg-ds-warning-soft',
    text: 'text-ds-warning',
    border: 'border-ds-warning/15',
  },
  MEDIUM: {
    label: 'Medium',
    bg: 'bg-ds-brand-soft',
    text: 'text-ds-brand',
    border: 'border-ds-brand/15',
  },
  LOW: {
    label: 'Low',
    bg: 'bg-ds-info-soft',
    text: 'text-ds-info',
    border: 'border-ds-info/15',
  },
  NO_PRIORITY: {
    label: 'No Priority',
    bg: 'bg-secondary',
    text: 'text-ds-text-muted',
    border: 'border-border',
  },
};

/**
 * Priority pill — bordered soft pill matching SHIP-122 / 119 / 123 variants
 * in shipyard.pen. Border at 15% of the semantic color gives edge definition
 * without hardening the pill.
 */
export function IssuePriorityBadge({
  priority,
  className,
}: {
  priority: IssuePriority;
  className?: string;
}) {
  const m = META[priority];
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center rounded-full border px-[7px] text-[10px] font-semibold leading-none tracking-wide',
        m.bg,
        m.text,
        m.border,
        className,
      )}
    >
      {m.label}
    </span>
  );
}

export { META as PRIORITY_META };
