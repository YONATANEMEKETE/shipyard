'use client';

import { format } from 'date-fns';
import { CalendarClock, Plus, RotateCw } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CycleCard } from '@shipyard/shared';

import { CreateCycleDialog } from '@/components/cycles/create-cycle-dialog';
import {
  cycleLengthDays,
  cycleProgressPercent,
  emptyStatusCounts,
  type IssueStatusCounts,
} from '@/components/cycles/cycle-progress';
import {
  CurrentCycleCardBody,
  CurrentCycleCardHeader,
} from '@/components/dashboard/current-cycle-card';
import { Loader } from '@/components/motion/loader';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { dashboardKeys, useDashboard } from '@/hooks/use-dashboard';
import { useIssues } from '@/hooks/use-issues';
import { useWorkspace } from '@/hooks/use-workspaces';

/**
 * Current Cycle — the dashboard rail's first panel, mirroring "Current Cycle
 * Panel" (ex7PC) in `Screen / Dashboard` (s4L8ST): the label + days-left chip,
 * the cycle name + date range, then the ring with its legend.
 *
 * The card itself lives in `current-cycle-card.tsx`, because the landing page
 * shows the same card with sample numbers. This file owns everything that
 * decides *whether* to draw it: the query, the role rule, the empty and error
 * states, and the create dialog.
 *
 * With no active cycle the panel keeps its label and shows the designed empty
 * state from `02-UX/Empty-states.md` §6.8 — copy split by role, because
 * "Create Cycle" is OWNER|ADMIN only (api-design §4.1) and a Member would be
 * offered an action they could never complete.
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

/**
 * The live cycle's card body. Per-status counts for the ring come from the
 * cycle's issue list — derived the way the cycle detail page derives them. The
 * default list is non-archived, which is the same scope the API's `progress`
 * counts, so the slices always total `progress.total`.
 *
 * Kept as its own component so the issue query only runs once there is a cycle
 * to ask about.
 */
function LiveCycleBody({ slug, cycle }: { slug: string; cycle: CycleCard }) {
  const issuesQuery = useIssues(slug, { cycleId: cycle.id });
  const statusCounts: IssueStatusCounts = useMemo(() => {
    const counts = emptyStatusCounts();
    for (const issue of issuesQuery.data?.issues ?? []) counts[issue.status]++;
    return counts;
  }, [issuesQuery.data]);

  return (
    <CurrentCycleCardBody
      name={cycle.name}
      startDate={cycle.startDate}
      endDate={cycle.endDate}
      percent={cycleProgressPercent(cycle)}
      statusCounts={statusCounts}
      completed={cycle.progress.completed}
      total={cycle.progress.total}
    />
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
      <CurrentCycleCardHeader
        daysLeft={cycle ? daysLeftLabel(cycle.endDate) : undefined}
      />

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
        <LiveCycleBody slug={slug} cycle={cycle} />
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
