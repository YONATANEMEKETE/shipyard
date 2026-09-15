'use client';

import { format } from 'date-fns';
import { CalendarClock, Plus, RotateCw, Timer } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CycleCard } from '@shipyard/shared';

import { CreateCycleDialog } from '@/components/cycles/create-cycle-dialog';
import {
  ISSUE_STATUS_META,
  ISSUE_STATUS_ORDER,
  cycleLengthDays,
  cycleProgressPercent,
  emptyStatusCounts,
  type IssueStatusCounts,
} from '@/components/cycles/cycle-progress';
import { Loader } from '@/components/motion/loader';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { dashboardKeys, useDashboard } from '@/hooks/use-dashboard';
import { useIssues } from '@/hooks/use-issues';
import { useWorkspace } from '@/hooks/use-workspaces';
import { cn } from '@/lib/utils';

// `echarts` is a heavy client-only dependency and the hub is a landing page —
// the same reasoning the cycle rail uses for its own chart. The placeholder
// reserves the ring's box so nothing shifts when it lands.
const CurrentCycleChart = dynamic(
  () =>
    import('@/components/dashboard/current-cycle-chart').then(
      (mod) => mod.CurrentCycleChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="size-32 shrink-0 animate-pulse rounded-full bg-ds-border/40"
      />
    ),
  },
);

/**
 * Current Cycle — the dashboard rail's first panel, mirroring "Current Cycle
 * Panel" (ex7PC) in `Screen / Dashboard` (s4L8ST): the label + days-left chip,
 * the cycle name + date range, then the ring with its legend.
 *
 * With no active cycle the panel keeps its label and shows the designed empty
 * state from `02-UX/Empty-states.md` §6.8 — copy split by role, because
 * "Create Cycle" is OWNER|ADMIN only (api-design §4.1) and a Member would be
 * offered an action they could never complete.
 *
 * The ring is sliced by *issue status* (Backlog → Done) rather than done/undone
 * — a cycle's progress is the mix of its issues, and the slices line up with the
 * groups on the Issues page. The API's inline `progress` carries only
 * `{ total, completed, percent }`, so per-status counts come from the cycle's
 * issue list, the same fetch and the same derivation the cycle detail page uses
 * ("the cycle's issues, only for the ring's status breakdown").
 */

/** "4 days left" / "Due today" / "Ended" — from the cycle's last day. */
function daysLeftLabel(endDate: string): string {
  const today = format(new Date(), 'yyyy-MM-dd');
  // Inclusive day count, so an end date of today reads as the final day
  // rather than as "0 days left".
  const days = cycleLengthDays(today, endDate);
  if (days < 0) return 'Ended';
  if (days === 0) return 'Due today';
  return days === 1 ? '1 day left' : `${days} days left`;
}

function CurrentCycleBody({ slug, cycle }: { slug: string; cycle: CycleCard }) {
  const percent = cycleProgressPercent(cycle);
  const { total, completed } = cycle.progress;

  // Per-status counts for the ring — derived the way the cycle detail page
  // derives them. The default list is non-archived, which is the same scope the
  // API's `progress` counts, so the slices always total `progress.total`.
  const issuesQuery = useIssues(slug, { cycleId: cycle.id });
  const statusCounts: IssueStatusCounts = useMemo(() => {
    const counts = emptyStatusCounts();
    for (const issue of issuesQuery.data?.issues ?? []) counts[issue.status]++;
    return counts;
  }, [issuesQuery.data]);

  const range = `${format(new Date(`${cycle.startDate}T12:00:00`), 'MMM d')} → ${format(
    new Date(`${cycle.endDate}T12:00:00`),
    'MMM d',
  )}`;

  return (
    <>
      {/* Name + dates. */}
      <div className="flex w-full items-center justify-between gap-3">
        <span className="truncate text-[15px] font-semibold leading-none text-foreground">
          {cycle.name}
        </span>
        <span className="shrink-0 font-mono text-[11px] leading-none text-ds-text-muted">
          {range}
        </span>
      </div>

      {/* Ring + legend. */}
      <div className="flex w-full items-center gap-5">
        <CurrentCycleChart
          percent={percent}
          statusCounts={statusCounts}
          completed={completed}
          total={total}
        />

        {/* Legend — same labels, order and tones as the Issues groups, so the
            key doubles as the breakdown. */}
        <ul className="flex min-w-0 flex-1 flex-col gap-3">
          {ISSUE_STATUS_ORDER.map((status) => {
            const meta = ISSUE_STATUS_META[status];
            return (
              <li key={status} className="flex w-full items-center gap-2">
                <span
                  aria-hidden
                  className={cn('size-2 shrink-0 rounded-full', meta.dot)}
                />
                <span className="min-w-0 flex-1 truncate text-[11.5px] leading-none text-ds-text-muted">
                  {meta.label}
                </span>
                <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums leading-none text-foreground">
                  {statusCounts[status]}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

export function CurrentCyclePanel({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const query = useDashboard(slug);
  const { data: workspace } = useWorkspace(slug);
  const [createOpen, setCreateOpen] = useState(false);

  // "Create Cycle" is OWNER|ADMIN only (api-design §4.1) — a Member gets the
  // message without an action they could never complete.
  const canCreate = workspace?.role !== 'MEMBER';
  const cycle = query.data?.currentCycle ?? null;

  // `useCreateCycle` invalidates the cycle list family only; the hub keeps its
  // own cache entry, so it has to be refreshed explicitly or the panel would sit
  // on a stale payload after a cycle is created from here.
  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    }
  };

  return (
    <section
      aria-label="Current cycle"
      className="flex w-full flex-col gap-3 rounded-xl border border-ds-border bg-ds-surface-subtle p-4"
    >
      {/* The label is not part of the cycle — it renders either way, so the card
          still says what it is when there is nothing in it. The days-left chip
          is cycle-specific, so it only appears alongside one. */}
      <div className="flex w-full items-center justify-between gap-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-ds-text-muted">
          Current Cycle
        </span>
        {cycle ? (
          <span className="inline-flex shrink-0 items-center gap-[5px] rounded-full bg-ds-warning-soft px-2 py-[3px] font-mono text-[10px] font-semibold leading-none text-ds-warning">
            <Timer aria-hidden className="size-[11px]" />
            {daysLeftLabel(cycle.endDate)}
          </span>
        ) : null}
      </div>

      {query.isPending ? (
        <div className="flex min-h-[164px] w-full items-center justify-center">
          <Loader size={28} variant="spinner" label="Loading current cycle" />
        </div>
      ) : query.isError ? (
        <div className="flex min-h-[164px] w-full items-center justify-center">
          <ErrorState
            title="Couldn't load the cycle"
            description="We ran into a problem fetching the workspace's active cycle."
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => query.refetch()}
                className="h-8 gap-2 rounded-md border-ds-border bg-ds-surface px-3 text-xs font-semibold text-foreground"
              >
                <RotateCw className="size-3.5" />
                Try again
              </Button>
            }
          />
        </div>
      ) : !cycle ? (
        // No active cycle is data, not an error (spec rule 5). A PLANNED cycle
        // is not "running", so it lands here too.
        <div className="flex min-h-[164px] w-full items-center justify-center">
          <EmptyState
            icon={CalendarClock}
            title="No active cycle is currently running"
            description={
              canCreate ? 'Create a cycle to begin planning work.' : undefined
            }
            action={
              canCreate ? (
                <Button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90"
                >
                  <Plus className="size-4" />
                  New cycle
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <CurrentCycleBody slug={slug} cycle={cycle} />
      )}

      {canCreate ? (
        <CreateCycleDialog
          open={createOpen}
          onOpenChange={handleCreateOpenChange}
          slug={slug}
        />
      ) : null}
    </section>
  );
}
