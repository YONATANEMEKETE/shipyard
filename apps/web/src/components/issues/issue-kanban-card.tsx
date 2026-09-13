'use client';

import {
  Calendar,
  CornerDownRight,
  Flag,
  MessageSquare,
  OctagonAlert,
} from 'lucide-react';
import type { IssueCard, IssuePriority } from '@shipyard/shared';
import { cn } from '@/lib/utils';

const PRIORITY_META: Record<
  IssuePriority,
  { label: string; bg: string; text: string; dot: string }
> = {
  URGENT: {
    label: 'Urgent',
    bg: 'bg-ds-danger-soft',
    text: 'text-ds-danger',
    dot: 'bg-ds-danger',
  },
  HIGH: {
    label: 'High',
    bg: 'bg-ds-warning-soft',
    text: 'text-ds-warning',
    dot: 'bg-ds-warning',
  },
  MEDIUM: {
    label: 'Medium',
    bg: 'bg-ds-brand-soft',
    text: 'text-ds-brand',
    dot: 'bg-ds-brand',
  },
  LOW: {
    label: 'Low',
    bg: 'bg-ds-info-soft',
    text: 'text-ds-info',
    dot: 'bg-ds-info',
  },
  NO_PRIORITY: {
    label: 'No priority',
    bg: 'bg-secondary',
    text: 'text-ds-text-muted',
    dot: 'bg-ds-border',
  },
};

const AVATAR_TONES = [
  'bg-ds-brand',
  'bg-ds-info',
  'bg-ds-warning',
  'bg-ds-success',
] as const;

function toneFor(userId: string): (typeof AVATAR_TONES)[number] {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1)
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

function formatDue(value: string | null): string {
  if (!value) return 'No due';
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function LabelPill({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex h-5 items-center rounded-full border border-transparent px-2 text-[10px] font-medium leading-none"
      style={{ backgroundColor: `${color}18`, color }}
    >
      {name}
    </span>
  );
}

export function IssueKanbanCard({
  issue,
  onOpen,
  onPointerDown,
  projectName,
  cycleName,
}: {
  issue: IssueCard;
  onOpen?: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
  projectName?: string | null;
  cycleName?: string | null;
}) {
  const prio = PRIORITY_META[issue.priority];
  const showProjectRow = Boolean(projectName || cycleName);

  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={onPointerDown}
      className="flex w-full cursor-grab flex-col gap-2.5 rounded-xl border border-ds-border bg-ds-surface p-3 text-left shadow-[0_2px_8px_#17171714] transition-colors active:cursor-grabbing hover:border-ds-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="inline-flex h-5 items-center justify-center rounded-sm bg-ds-sidebar px-1.5 font-mono text-[10px] font-semibold leading-none text-ds-text-muted">
          {issue.identifier}
        </span>
        <span
          className={cn(
            'inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-semibold leading-none',
            prio.bg,
            prio.text,
          )}
        >
          <Flag className="size-[11px] shrink-0" aria-hidden />
          {prio.label}
        </span>
      </span>

      <span className="line-clamp-2 text-[14px] font-semibold leading-snug text-foreground">
        {issue.title}
      </span>

      {showProjectRow ? (
        <span className="flex w-full items-center gap-1 text-[11px] leading-none text-ds-text-muted">
          <CornerDownRight className="size-3 shrink-0" aria-hidden />
          <span className="truncate font-medium">
            {projectName ?? 'No project'}
          </span>
          {projectName && cycleName ? (
            <span className="text-ds-border-strong">•</span>
          ) : null}
          {cycleName ? <span className="truncate">{cycleName}</span> : null}
        </span>
      ) : null}

      {issue.labels.length > 0 || issue.blocked ? (
        <span className="flex w-full flex-wrap items-center gap-1.5">
          {issue.labels.map((label) => (
            <LabelPill key={label.id} name={label.name} color={label.color} />
          ))}
          {issue.blocked ? (
            <span
              title={issue.blockedReason ?? undefined}
              className="inline-flex h-5 items-center gap-1 rounded-full bg-ds-danger-soft px-2 text-[10px] font-semibold text-ds-danger"
            >
              <OctagonAlert className="size-3 shrink-0" aria-hidden />
              Blocked
            </span>
          ) : null}
        </span>
      ) : null}

      <span className="h-px w-full bg-ds-border" aria-hidden />

      <span className="flex w-full items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          {issue.assignee ? (
            issue.assignee.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={issue.assignee.image}
                alt={issue.assignee.name}
                className="size-5 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full font-mono text-[7px] font-bold text-white',
                  toneFor(issue.assignee.userId),
                )}
              >
                {initialsOf(issue.assignee.name)}
              </span>
            )
          ) : (
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ds-sidebar font-mono text-[7px] font-bold text-ds-text-muted">
              ?
            </span>
          )}
          <span className="text-[11px] font-medium leading-none text-foreground">
            {issue.assignee
              ? issue.assignee.name.split(' ')[0] +
                (issue.assignee.name.split(' ').length > 1
                  ? ` ${issue.assignee.name.split(' ')[1]![0]}.`
                  : '')
              : 'Unassigned'}
          </span>
        </span>

        <span className="flex items-center gap-2">
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-ds-surface-subtle px-2 text-[11px] leading-none text-ds-text-muted">
            <Calendar className="size-3 shrink-0" aria-hidden />
            {formatDue(issue.dueDate)}
          </span>
          <span className="flex items-center gap-1 text-[11px] leading-none text-ds-text-muted">
            <MessageSquare className="size-3 shrink-0" aria-hidden />0
          </span>
        </span>
      </span>
    </button>
  );
}
