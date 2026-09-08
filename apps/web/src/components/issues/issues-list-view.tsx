'use client';

import {
  Circle,
  CircleDashed,
  CircleCheck,
  Inbox,
  Loader,
  Loader2,
  OctagonAlert,
  Plus,
  RotateCw,
} from 'lucide-react';
import type { IssueCard, IssueStatus } from '@shipyard/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { IssuePriorityBadge } from '@/components/issues/issue-priority-badge';
import { IssueLabelPills } from '@/components/issues/issue-label-pill';

const GROUP_ORDER: IssueStatus[] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE'];

const GROUP_META: Record<IssueStatus, { label: string; dot: string }> = {
  BACKLOG: { label: 'Backlog', dot: 'bg-ds-text-muted' },
  TODO: { label: 'Todo', dot: 'bg-ds-info' },
  IN_PROGRESS: { label: 'In Progress', dot: 'bg-ds-brand' },
  DONE: { label: 'Done', dot: 'bg-ds-success' },
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
  if (!value) return '—';
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function isOverdue(value: string | null): boolean {
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${value}T12:00:00`);
  return due < today;
}

function statusIcon(status: IssueStatus) {
  switch (status) {
    case 'BACKLOG':
      return (
        <CircleDashed
          className="size-3.5 shrink-0 text-ds-text-muted"
          aria-hidden
        />
      );
    case 'TODO':
      return <Circle className="size-3.5 shrink-0 text-ds-info" aria-hidden />;
    case 'IN_PROGRESS':
      return <Loader className="size-3.5 shrink-0 text-ds-brand" aria-hidden />;
    case 'DONE':
      return (
        <CircleCheck
          className="size-3.5 shrink-0 text-ds-success"
          aria-hidden
        />
      );
    default:
      return (
        <Circle className="size-3.5 shrink-0 text-ds-text-muted" aria-hidden />
      );
  }
}

function IssueRow({ issue }: { issue: IssueCard }) {
  const overdue = isOverdue(issue.dueDate);

  return (
    <div className="flex h-11 w-full items-center gap-2.5 border-b border-ds-border px-4 last:border-b-0 transition-colors hover:bg-ds-bg">
      <IssuePriorityBadge priority={issue.priority} />

      <span className="shrink-0 font-mono text-[10px] font-semibold leading-none text-ds-text-muted">
        {issue.identifier}
      </span>

      {statusIcon(issue.status)}

      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium leading-none text-foreground">
        {issue.title}
      </span>

      {issue.blocked ? (
        <span className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full bg-ds-danger-soft px-[7px] text-[10px] font-semibold text-ds-danger">
          <OctagonAlert className="size-2.5" aria-hidden />
          Blocked
        </span>
      ) : null}

      <IssueLabelPills labels={issue.labels} />

      <span
        className={cn(
          'hidden w-[52px] shrink-0 text-right text-[11.5px] leading-none sm:block',
          overdue
            ? 'font-semibold text-ds-danger'
            : 'font-normal text-ds-text-muted',
        )}
      >
        {formatDue(issue.dueDate)}
      </span>

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
              'grid size-5 shrink-0 place-items-center rounded-full font-mono text-[8px] font-bold text-white',
              toneFor(issue.assignee.userId),
            )}
            aria-label={issue.assignee.name}
            title={issue.assignee.name}
          >
            {initialsOf(issue.assignee.name)}
          </span>
        )
      ) : (
        <span className="hidden w-[68px] shrink-0 text-right text-[11.5px] leading-none text-ds-text-muted sm:block">
          Unassigned
        </span>
      )}
    </div>
  );
}

/**
 * Issues Grouped List — mirrors "Issues Grouped List" (WDauM) in shipyard.pen.
 * Grouped by status BACKLOG / TODO / IN_PROGRESS / DONE, ordered.
 * Handles centered loading (Loader2), error (ErrorState) and empty (EmptyState)
 * like ProjectListView — parent drives the query and passes the flags.
 */
export function IssuesListView({
  issues,
  loading = false,
  error = false,
  onRetry,
  hasActiveFilters = false,
}: {
  issues: IssueCard[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  hasActiveFilters?: boolean;
}) {
  const grouped = GROUP_ORDER.map((status) => ({
    status,
    meta: GROUP_META[status],
    issues: issues.filter((i) => i.status === status),
  })).filter((g) => g.issues.length > 0);

  const showEmpty = !loading && !error && grouped.length === 0;
  const centered = loading || error || showEmpty;

  if (centered) {
    return (
      <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center">
        {loading ? (
          <Loader2
            aria-label="Loading issues"
            className="size-6 animate-spin text-muted-foreground"
          />
        ) : error ? (
          <ErrorState
            title="Couldn't load issues"
            description="We ran into a problem fetching the issue list. Try again in a moment."
            action={
              onRetry ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onRetry}
                  className="h-8 gap-2 rounded-md border-ds-border bg-ds-surface px-3 text-xs font-semibold text-foreground"
                >
                  <RotateCw className="size-3.5" />
                  Try again
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title={hasActiveFilters ? 'No issues match' : 'No issues yet'}
            description={
              hasActiveFilters
                ? 'Try a different search or clear the filters.'
                : 'Create your first issue to start tracking work.'
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      {grouped.map((group) => (
        <section
          key={group.status}
          aria-label={group.meta.label}
          className="flex w-full flex-col"
        >
          <div className="flex h-9 w-full items-center gap-2 border-b border-ds-border bg-ds-surface-subtle px-4">
            <span
              aria-hidden
              className={cn('size-2 shrink-0 rounded-full', group.meta.dot)}
            />
            <span className="text-[12.5px] font-semibold leading-none text-foreground">
              {group.meta.label}
            </span>
            <span className="font-mono text-[10px] font-semibold leading-none text-ds-text-muted">
              {group.issues.length}
            </span>
            <span className="min-w-0 flex-1" aria-hidden />
            <button
              type="button"
              aria-label={`Add ${group.meta.label} issue`}
              title={`Add ${group.meta.label} issue`}
              className="grid size-6 shrink-0 place-items-center rounded-md text-ds-text-muted transition-colors hover:bg-ds-bg hover:text-foreground"
              onClick={() => undefined}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="flex w-full flex-col">
            {group.issues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
