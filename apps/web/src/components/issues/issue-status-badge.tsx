'use client';

import { Circle, CircleCheck, CircleDashed, Loader } from 'lucide-react';
import type { IssueStatus } from '@shipyard/shared';
import { cn } from '@/lib/utils';

/**
 * Status glyph + pill — the glyph set and colours are the ones the issue rows
 * and detail rail already use (BACKLOG dashed / TODO circle / IN_PROGRESS
 * loader / DONE check, each in its status colour), lifted into one component so
 * surfaces that show status as a labelled value (issue history) render the same
 * signal as a status cell rather than inventing their own.
 */
export const ISSUE_STATUS_META: Record<
  IssueStatus,
  { label: string; text: string; bg: string; border: string }
> = {
  BACKLOG: {
    label: 'Backlog',
    text: 'text-ds-text-muted',
    bg: 'bg-secondary',
    border: 'border-border',
  },
  TODO: {
    label: 'Todo',
    text: 'text-ds-info',
    bg: 'bg-ds-info-soft',
    border: 'border-ds-info/15',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    text: 'text-ds-brand',
    bg: 'bg-ds-brand-soft',
    border: 'border-ds-brand/15',
  },
  DONE: {
    label: 'Done',
    text: 'text-ds-success',
    bg: 'bg-ds-success-soft',
    border: 'border-ds-success/15',
  },
};

export function IssueStatusGlyph({
  status,
  className,
}: {
  status: IssueStatus;
  className?: string;
}) {
  const glyphClass = cn(
    'size-3.5 shrink-0',
    ISSUE_STATUS_META[status].text,
    className,
  );
  switch (status) {
    case 'BACKLOG':
      return <CircleDashed className={glyphClass} aria-hidden />;
    case 'TODO':
      return <Circle className={glyphClass} aria-hidden />;
    case 'IN_PROGRESS':
      return <Loader className={glyphClass} aria-hidden />;
    case 'DONE':
      return <CircleCheck className={glyphClass} aria-hidden />;
    default:
      return <Circle className={glyphClass} aria-hidden />;
  }
}

/** Status as a labelled pill — same colour pair and border weight as the
 *  priority badge, with the row's glyph so colour is never the only signal. */
export function IssueStatusBadge({
  status,
  className,
}: {
  status: IssueStatus;
  className?: string;
}) {
  const meta = ISSUE_STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full border px-[7px] text-[10px] font-semibold leading-none',
        meta.bg,
        meta.text,
        meta.border,
        className,
      )}
    >
      <IssueStatusGlyph status={status} className="size-3" />
      {meta.label}
    </span>
  );
}
