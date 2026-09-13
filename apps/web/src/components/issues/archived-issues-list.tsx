'use client';

import {
  Archive,
  Circle,
  CircleCheck,
  CircleDashed,
  Loader as LoaderIcon,
  RotateCw,
} from 'lucide-react';
import { useState } from 'react';

import type { IssueCard, IssueStatus } from '@shipyard/shared';
import { Loader } from '@/components/motion/loader';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useRestoreIssue } from '@/hooks/use-issues';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

const STORED_STATUS_LABEL: Record<IssueStatus, string> = {
  BACKLOG: 'was Backlog',
  TODO: 'was Todo',
  IN_PROGRESS: 'was In Progress',
  DONE: 'was Done',
};

/** Restored-from label — the toast says which status came back with it. */
const STATUS_LABEL: Record<IssueStatus, string> = {
  BACKLOG: 'Backlog',
  TODO: 'Todo',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
};

/**
 * Stored-status glyph. Muted on purpose: archived rows are read-only history,
 * so the icon is a quiet marker rather than the coloured status cue the active
 * list uses (design: Status Circle, $ds-text-muted).
 */
function statusIcon(status: IssueStatus) {
  const className = 'size-3.5 shrink-0 text-ds-text-muted';
  switch (status) {
    case 'BACKLOG':
      return <CircleDashed className={className} aria-hidden />;
    case 'IN_PROGRESS':
      return <LoaderIcon className={className} aria-hidden />;
    case 'DONE':
      return <CircleCheck className={className} aria-hidden />;
    default:
      return <Circle className={className} aria-hidden />;
  }
}

/**
 * Archived Issues — mirrors "Screen / Issues - Archived" (LHNUN) in
 * shipyard.pen: a single archived group (no card container) with a 36px
 * header (archive glyph + Archived + count) over 44px read-only rows —
 * identifier, stored-status glyph, title, ARCHIVED badge, "was <Status>" and
 * a brand Restore action.
 *
 * Rows are deliberately not openable: an archived issue is read-only history,
 * so the row is a plain frame — the only affordance is Restore. Restoring
 * needs no confirmation (non-destructive); the label swaps for an inline
 * loader while the row leaves the list with its status preserved.
 */
export function ArchivedIssuesList({
  slug,
  issues,
  search = '',
  loading = false,
  error = false,
  onRetry,
}: {
  slug: string;
  issues: IssueCard[];
  /** Toolbar search — filters by identifier or title, live. */
  search?: string;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const { showToast } = useToast();
  const restoreMutation = useRestoreIssue(slug, {
    onError: (err) => {
      showToast({
        status: 'error',
        title: "Couldn't restore issue",
        description: err.message || 'Please try again.',
      });
    },
  });

  // Which row's restore is in flight — shows the inline loader on that button.
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const handleRestore = (issue: IssueCard) => {
    setRestoringId(issue.id);
    restoreMutation.mutate(
      { issueId: issue.id },
      {
        onSettled: () => setRestoringId(null),
        onSuccess: (restored) => {
          showToast({
            status: 'success',
            title: 'Issue restored',
            description: `${restored.identifier} is back with its ${
              STATUS_LABEL[restored.status]
            } status.`,
          });
        },
      },
    );
  };

  const query = search.trim().toLowerCase();
  const visible =
    query === ''
      ? issues
      : issues.filter(
          (issue) =>
            issue.title.toLowerCase().includes(query) ||
            issue.identifier.toLowerCase().includes(query),
        );

  const showEmpty = !loading && !error && visible.length === 0;
  const centered = loading || error || showEmpty;

  return (
    <div className="flex h-full w-full flex-col">
      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          centered && 'flex flex-col items-center justify-center',
        )}
      >
        {loading ? (
          <Loader size={28} variant="spinner" label="Loading archived issues" />
        ) : error ? (
          <ErrorState
            title="Couldn't load archived issues"
            description="We ran into a problem fetching the archive. Try again in a moment."
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
            icon={Archive}
            title={query ? 'No archived issues match' : 'No archived issues'}
            description={
              query
                ? 'Try a different identifier or title — or clear the search.'
                : 'Archive an issue and it lands here, ready to restore.'
            }
          />
        ) : (
          <section aria-label="Archived">
            <div className="flex h-9 items-center gap-2 border-b border-ds-border bg-ds-surface-subtle px-4">
              <Archive
                aria-hidden
                className="size-[13px] shrink-0 text-ds-text-muted"
              />
              <span className="text-[12.5px] font-semibold leading-none text-foreground">
                Archived
              </span>
              <span className="font-mono text-[10px] font-semibold leading-none text-ds-text-muted">
                {visible.length}
              </span>
              <span className="flex-1" aria-hidden />
            </div>
            {visible.map((issue) => {
              const restoring = restoringId === issue.id;
              return (
                <div
                  key={issue.id}
                  className="flex h-11 items-center gap-2.5 border-b border-ds-border/70 px-4 last:border-b-0"
                >
                  <span className="shrink-0 font-mono text-[10px] font-semibold leading-none text-ds-text-muted">
                    {issue.identifier}
                  </span>
                  {statusIcon(issue.status)}
                  <span className="min-w-0 flex-1 truncate text-[12.5px] leading-none text-ds-text-muted">
                    {issue.title}
                  </span>
                  <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-[#F0EFEB] px-[7px] font-mono text-[9px] font-semibold leading-none tracking-[0.7px] text-ds-text-muted">
                    ARCHIVED
                  </span>
                  {/* Stored status hides on small screens — badge + restore
                      stay reachable without horizontal scrolling. */}
                  <span className="hidden w-24 shrink-0 text-[11.5px] leading-none text-ds-text-muted sm:block">
                    {STORED_STATUS_LABEL[issue.status]}
                  </span>
                  <button
                    type="button"
                    disabled={restoring || restoreMutation.isPending}
                    onClick={() => handleRestore(issue)}
                    className="shrink-0 text-xs font-semibold text-ds-brand transition-colors hover:text-ds-brand/80 disabled:pointer-events-none disabled:opacity-60"
                  >
                    {restoring ? (
                      <Loader
                        size={13}
                        variant="spinner"
                        label="Restoring issue"
                      />
                    ) : (
                      'Restore'
                    )}
                  </button>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
