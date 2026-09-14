'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronRight,
  Circle,
  CircleCheck,
  CircleDashed,
  Flag,
  Inbox,
  Loader,
  Loader2,
  RotateCw,
} from 'lucide-react';
import type { IssueCard, IssuePriority, IssueStatus } from '@shipyard/shared';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import {
  ISSUE_STATUS_META,
  ISSUE_STATUS_ORDER,
} from '@/components/cycles/cycle-progress';

/**
 * The cycle's issues — the pen's "Issues Section" (OfFfw) below the goal:
 * a title + count chip, then the issues grouped by status.
 *
 * Grouping, collapse behaviour and the loading / error / empty states mirror
 * IssuesListView exactly — same group header (chevron, dot, label, mono count),
 * same collapse animation, same centered states and copy pattern, and no card
 * wrapper: the groups sit directly on the page the way they do on the Issues
 * page. The rows carry the fewer details the pen draws for this surface — a
 * priority pill, the identifier, a status glyph, the title and the assignee.
 * Labels, due date and the blocked flag belong to the full issue list.
 *
 * Presentational and props-driven, so every state can be reviewed against a
 * fixture. The parent passes the issue query it already runs for the progress
 * ring, so this section costs no extra request.
 */

const PRIORITY_LABEL: Record<IssuePriority, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NO_PRIORITY: 'No priority',
};

/** Avatar tones — deterministic per user, echoing the varied pen avatars. */
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
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

function statusIcon(status: IssueStatus) {
  switch (status) {
    case 'BACKLOG':
      return <CircleDashed className="size-3.5 shrink-0 text-ds-text-muted" />;
    case 'TODO':
      return <Circle className="size-3.5 shrink-0 text-ds-info" />;
    case 'IN_PROGRESS':
      return <Loader className="size-3.5 shrink-0 text-ds-brand" />;
    case 'DONE':
      return <CircleCheck className="size-3.5 shrink-0 text-ds-success" />;
    default:
      return <Circle className="size-3.5 shrink-0 text-ds-text-muted" />;
  }
}

function IssueRow({
  issue,
  onOpen,
}: {
  issue: IssueCard;
  onOpen?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-11 w-full items-center gap-2.5 border-b border-ds-border/70 px-4 text-left transition-colors last:border-b-0 hover:bg-ds-bg"
    >
      {/* Priority pill — flag + label, muted per the pen (the full issue list
          uses the colored dot badge instead). */}
      <span className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-ds-border bg-ds-surface px-2 text-[11px] font-semibold text-muted-foreground">
        <Flag aria-hidden className="size-[11px] shrink-0" />
        {PRIORITY_LABEL[issue.priority]}
      </span>

      <span className="shrink-0 font-mono text-[10px] font-semibold leading-none text-ds-text-muted">
        {issue.identifier}
      </span>

      {statusIcon(issue.status)}

      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium leading-none text-foreground">
        {issue.title}
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
              'grid size-5 shrink-0 place-items-center rounded-full font-mono text-[7px] font-bold text-white',
              toneFor(issue.assignee.userId),
            )}
            aria-label={issue.assignee.name}
            title={issue.assignee.name}
          >
            {initialsOf(issue.assignee.name)}
          </span>
        )
      ) : (
        <span className="size-5 shrink-0" aria-hidden />
      )}
    </button>
  );
}

export function CycleIssuesList({
  issues,
  loading = false,
  error = false,
  onRetry,
  onOpenIssue,
}: {
  issues: IssueCard[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onOpenIssue?: (issue: IssueCard) => void;
}) {
  const grouped = useMemo(
    () =>
      ISSUE_STATUS_ORDER.map((status) => ({
        status,
        meta: ISSUE_STATUS_META[status],
        issues: issues.filter((issue) => issue.status === status),
      })).filter((group) => group.issues.length > 0),
    [issues],
  );

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
    <section aria-label="Issues" className="flex w-full flex-col gap-2.5">
      <div className="flex w-full items-center gap-2">
        <h2 className="text-[13px] font-semibold text-foreground">Issues</h2>
        <span className="inline-flex h-5 shrink-0 items-center justify-center rounded-full border border-ds-border bg-ds-bg px-2 font-mono text-[10px] font-semibold text-muted-foreground">
          {issues.length}
        </span>
      </div>

      <div
        className={cn(
          'flex w-full flex-col',
          centered && 'min-h-[220px] items-center justify-center',
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
            description="We ran into a problem fetching this cycle's issues."
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
            title="No issues in this cycle yet"
            description="Issues you add to this cycle show up here, grouped by status."
          />
        ) : (
          grouped.map((group) => {
            const isCollapsed = collapsed.has(group.status);
            return (
              <div key={group.status} className="flex w-full flex-col">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  aria-controls={`cycle-group-${group.status}`}
                  onClick={() => toggle(group.status)}
                  className="flex h-9 w-full items-center gap-2 border-b border-ds-border bg-ds-surface-subtle px-4 text-left"
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
                <AnimatePresence initial={false}>
                  {!isCollapsed ? (
                    <motion.div
                      id={`cycle-group-${group.status}`}
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
                            onOpen={
                              onOpenIssue ? () => onOpenIssue(issue) : undefined
                            }
                          />
                        ))}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
