'use client';

import {
  ChevronRight,
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
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { IssueCard, IssueStatus } from '@shipyard/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { IssuePriorityBadge } from '@/components/issues/issue-priority-badge';
import { IssueLabelPill } from '@/components/issues/issue-label-pill';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const GROUP_ORDER: IssueStatus[] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE'];

const GROUP_META: Record<IssueStatus, { label: string; dot: string }> = {
  BACKLOG: { label: 'Backlog', dot: 'bg-ds-text-muted' },
  TODO: { label: 'Todo', dot: 'bg-ds-info' },
  IN_PROGRESS: { label: 'In Progress', dot: 'bg-ds-brand' },
  DONE: { label: 'Done', dot: 'bg-ds-success' },
};

/** Label pills shown per row before they collapse into a `+N` count. */
const MAX_ROW_LABELS = 2;

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

/**
 * One list row. The row is a fixed-height flex line, so every column either
 * truncates (the title) or is capped — a row that needs more width than it has
 * would push the whole list sideways instead of scrolling, which is exactly how
 * it used to break on narrow screens.
 *
 * Responsive ladder, widest first:
 *   - every width: priority, identifier, title, blocked flag, assignee
 *   - `sm` and up: label pills (max 2 + a `+N` count) and due date
 *   - `sm` and up: the status icon — rows are grouped by status, so on a phone
 *     it only repeats the group header and the width is better spent on the
 *     title
 */
function IssueRow({
  issue,
  onOpen,
}: {
  issue: IssueCard;
  onOpen?: () => void;
}) {
  const overdue = isOverdue(issue.dueDate);
  const shownLabels = issue.labels.slice(0, MAX_ROW_LABELS);
  const hiddenLabelCount = issue.labels.length - shownLabels.length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-12 w-full items-center gap-3 border-b border-ds-border/70 px-4 text-left last:border-b-0 transition-colors hover:bg-ds-bg"
    >
      <IssuePriorityBadge priority={issue.priority} />
      <span className="shrink-0 font-mono text-[10px] font-semibold leading-none text-ds-text-muted">
        {issue.identifier}
      </span>
      <span className="hidden shrink-0 sm:block">
        {statusIcon(issue.status)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium leading-none text-foreground">
        {issue.title}
      </span>
      {issue.blocked ? (
        <span
          title={issue.blockedReason ?? undefined}
          className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full bg-ds-danger-soft px-[7px] text-[10px] font-semibold text-ds-danger"
        >
          <OctagonAlert className="size-2.5" aria-hidden />
          Blocked
        </span>
      ) : null}
      {shownLabels.length > 0 ? (
        <span className="hidden shrink-0 items-center gap-1 sm:flex">
          {shownLabels.map((label) => (
            <IssueLabelPill
              key={label.id}
              label={label}
              className="max-w-[96px]"
            />
          ))}
          {hiddenLabelCount > 0 ? (
            <span
              title={issue.labels
                .slice(MAX_ROW_LABELS)
                .map((label) => label.name)
                .join(', ')}
              className="inline-flex h-[18px] shrink-0 items-center rounded-full border border-ds-border px-[6px] text-[10px] font-medium leading-none text-ds-text-muted"
            >
              +{hiddenLabelCount}
            </span>
          ) : null}
        </span>
      ) : null}
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
    </button>
  );
}

export function IssuesListView({
  issues,
  loading = false,
  error = false,
  onRetry,
  hasActiveFilters = false,
  onAddIssue,
  onOpenIssue,
}: {
  issues: IssueCard[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  hasActiveFilters?: boolean;
  onAddIssue?: (status: IssueStatus) => void;
  onOpenIssue?: (issue: IssueCard) => void;
}) {
  const grouped = GROUP_ORDER.map((status) => ({
    status,
    meta: GROUP_META[status],
    issues: issues.filter((i) => i.status === status),
  })).filter((g) => g.issues.length > 0);

  const [collapsed, setCollapsed] = useState<Set<IssueStatus>>(new Set());
  const toggle = (status: IssueStatus) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });

  const showEmpty = !loading && !error && grouped.length === 0;
  const centered = loading || error || showEmpty;

  return (
    <div className="flex h-full w-full flex-col">
      {/* The list owns its scroll area, like Projects and Archived: header and
          toolbar hold still and only the rows move. Without this the list grew
          past its flex parent and the shell clipped it instead of scrolling. */}
      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          centered && 'flex flex-col items-center justify-center',
        )}
      >
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
        ) : showEmpty ? (
          <EmptyState
            icon={Inbox}
            title={hasActiveFilters ? 'No issues match' : 'No issues yet'}
            description={
              hasActiveFilters
                ? 'Try a different search or clear the filters.'
                : 'Create your first issue to start tracking work.'
            }
          />
        ) : (
          <div className="flex w-full flex-col">
            {grouped.map((group) => {
              const isCollapsed = collapsed.has(group.status);
              return (
                <section
                  key={group.status}
                  aria-label={group.meta.label}
                  className="flex w-full flex-col"
                >
                  <div className="flex h-9 w-full items-center gap-2 border-b border-ds-border bg-ds-surface-subtle px-4">
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      aria-controls={`group-${group.status}`}
                      onClick={() => toggle(group.status)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className={cn(
                          'grid size-6 shrink-0 place-items-center rounded-md text-ds-text-muted transition-transform duration-200',
                          isCollapsed ? '-rotate-90' : 'rotate-0',
                        )}
                        aria-hidden
                      >
                        <ChevronRight className="size-3.5" />
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          group.meta.dot,
                        )}
                      />
                      <span className="text-[12.5px] font-semibold leading-none text-foreground">
                        {group.meta.label}
                      </span>
                      <span className="font-mono text-[10px] font-semibold leading-none text-ds-text-muted">
                        {group.issues.length}
                      </span>
                    </button>
                    {group.status !== 'DONE' ? (
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={`New ${group.meta.label} issue`}
                              onClick={() => onAddIssue?.(group.status)}
                              className="grid size-6 shrink-0 place-items-center rounded-md text-ds-text-muted transition-colors hover:bg-ds-bg hover:text-foreground"
                            >
                              <Plus className="size-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            New {group.meta.label} issue
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="size-6 shrink-0" aria-hidden />
                    )}
                  </div>
                  <AnimatePresence initial={false}>
                    {!isCollapsed ? (
                      <motion.div
                        id={`group-${group.status}`}
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="flex w-full flex-col">
                          {group.issues.map((issue) => (
                            <IssueRow
                              key={issue.id}
                              issue={issue}
                              onOpen={() => onOpenIssue?.(issue)}
                            />
                          ))}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
