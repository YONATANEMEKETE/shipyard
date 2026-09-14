'use client';

import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { CycleStatus } from '@shipyard/shared';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Loader } from '@/components/motion/loader';
import { CycleDetailHeader } from '@/components/cycles/cycle-detail-header';
import { CycleGoalSection } from '@/components/cycles/cycle-goal-section';
import { CyclePropertiesRail } from '@/components/cycles/cycle-properties-rail';
import { ArchiveCycleDialog } from '@/components/cycles/archive-cycle-dialog';
import { DeleteCycleDialog } from '@/components/cycles/delete-cycle-dialog';
import { CycleIssuesList } from '@/components/cycles/cycle-issues-list';
import { useWorkspace } from '@/hooks/use-workspaces';
import {
  emptyStatusCounts,
  type IssueStatusCounts,
} from '@/components/cycles/cycle-progress';
import { useIssues } from '@/hooks/use-issues';
import { useToast } from '@/components/providers/toast-provider';
import {
  useCompleteCycle,
  useCycle,
  useReopenCycle,
  useRestoreCycle,
  useStartCycle,
  useUpdateCycle,
} from '@/hooks/use-cycles';

/**
 * Cycles detail page.
 *
 * Reads the cycle detail (card + goal + derived progress) and renders the
 * header. Mismatched or unknown `:cycleId` resolves to the query's error
 * state, which offers a retry.
 *
 * The page owns the lifecycle write: it picks the hook that matches the
 * cycle's current status and resolves to a boolean, so the header's stateful
 * button can show its own beat and the toast stays the single error surface.
 * A successful write invalidates the detail, so the status chip, the button
 * label and the meta line advance together. The goal writes the same way.
 *
 * The rail's ring is sliced by *issue* status, which the cycle payload does not
 * carry (`CycleProgress` is just total/completed/percent) — so the page reads
 * the cycle's issues (`?cycleId=`) and groups them client-side. The list
 * endpoint is deliberately unpaginated so exactly this kind of grouping stays
 * complete, and it matches the Issues page's own groups.
 *
 * That same query feeds the issues section under the goal, so the roster and
 * the ring can never disagree — and the section costs no extra request.
 */

/** Post-write copy per transition — the state that was left, not entered. */
const LIFECYCLE_TOAST: Record<
  CycleStatus,
  { title: string; description: string }
> = {
  PLANNED: {
    title: 'Cycle started',
    description: 'It is now the active cycle.',
  },
  ACTIVE: {
    title: 'Cycle completed',
    description: 'Unfinished issues stay open.',
  },
  COMPLETED: {
    title: 'Cycle reopened',
    description: 'It is active again.',
  },
};

/** Day-precision "has not started yet" — the gate on a permanent delete. */
function isFuture(startDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${startDate}T00:00:00`).getTime() > today.getTime();
}

export function CycleDetailPage({
  slug,
  cycleId,
}: {
  slug: string;
  cycleId: string;
}) {
  const { data: cycle, isPending, isError, refetch } = useCycle(slug, cycleId);
  const { data: workspace } = useWorkspace(slug);
  const { showToast } = useToast();
  const router = useRouter();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Archive and Delete are OWNER|ADMIN at the guard layer, so Members get no
  // affordance rather than a button that could only 403.
  const canManage = workspace?.role !== 'MEMBER';

  // One hook per legal transition; the header's label already mirrors this
  // mapping, so only the write that matches the current status is ever used.
  const startCycle = useStartCycle(slug);
  const completeCycle = useCompleteCycle(slug);
  const reopenCycle = useReopenCycle(slug);
  const updateCycle = useUpdateCycle(slug);
  const restoreCycle = useRestoreCycle(slug);

  // The cycle's issues, only for the ring's status breakdown. Same filters the
  // API's `progress` derives from: non-archived issues of this cycle.
  const issuesQuery = useIssues(
    slug,
    cycle ? { cycleId: cycle.id } : undefined,
    { enabled: Boolean(cycle) },
  );
  const statusCounts: IssueStatusCounts = useMemo(() => {
    const counts = emptyStatusCounts();
    for (const issue of issuesQuery.data?.issues ?? []) counts[issue.status]++;
    return counts;
  }, [issuesQuery.data]);

  // Delete is offered only for a future Planned cycle. It runs
  // `unassignOnCycleDelete`, which filters on cycleId alone — archived issues
  // are unassigned too — while `progress.total` counts only live ones, so the
  // confirm's count adds the archived set or it would understate the blast
  // radius. Fetched only when delete is on the table.
  const canDelete = Boolean(
    cycle &&
    !cycle.archivedAt &&
    cycle.status === 'PLANNED' &&
    isFuture(cycle.startDate),
  );
  const archivedIssuesQuery = useIssues(
    slug,
    cycle ? { cycleId: cycle.id, archived: 'true' } : undefined,
    { enabled: Boolean(cycle) && canDelete },
  );

  /** Resolves false on failure so the caller can render an error beat. */
  const runLifecycleAction = async (): Promise<boolean> => {
    if (!cycle) return false;
    const mutation = {
      PLANNED: startCycle,
      ACTIVE: completeCycle,
      COMPLETED: reopenCycle,
    }[cycle.status];
    const copy = LIFECYCLE_TOAST[cycle.status];
    try {
      const next = await mutation.mutateAsync({ cycleId: cycle.id });
      showToast({
        status: 'success',
        title: copy.title,
        description: `${next.name} — ${copy.description}`,
      });
      return true;
    } catch (error) {
      showToast({
        status: 'error',
        title: 'Cycle update failed',
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
      return false;
    }
  };

  /** Same contract as the lifecycle write: boolean, toast owns the error. */
  const saveGoal = async (goal: string | null): Promise<boolean> => {
    if (!cycle) return false;
    try {
      await updateCycle.mutateAsync({ cycleId: cycle.id, body: { goal } });
      showToast({
        status: 'success',
        title: 'Goal updated',
        description: `${cycle.name} — goal saved`,
      });
      return true;
    } catch (error) {
      showToast({
        status: 'error',
        title: "Couldn't update goal",
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
      return false;
    }
  };

  /**
   * Date edits send only the changed field. The server re-runs the overlap and
   * single-active checks, so a conflicting range comes back as a 409 with the
   * offending cycle named in the message — surfaced through the toast.
   */
  const saveDates = async (patch: {
    startDate?: string;
    endDate?: string;
  }): Promise<boolean> => {
    if (!cycle) return false;
    try {
      const next = await updateCycle.mutateAsync({
        cycleId: cycle.id,
        body: patch,
      });
      showToast({
        status: 'success',
        title: 'Dates updated',
        description: `${next.name} — ${format(new Date(`${next.startDate}T12:00:00`), 'MMM d')} – ${format(new Date(`${next.endDate}T12:00:00`), 'MMM d')}`,
      });
      return true;
    } catch (error) {
      showToast({
        status: 'error',
        title: "Couldn't update dates",
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
      return false;
    }
  };

  /** Restores an archived cycle in place — the rail keeps the reader here. */
  const restore = async (): Promise<boolean> => {
    if (!cycle) return false;
    try {
      const next = await restoreCycle.mutateAsync({ cycleId: cycle.id });
      showToast({
        status: 'success',
        title: 'Cycle restored',
        description: `${next.name} is back in the active list.`,
      });
      return true;
    } catch (error) {
      // A restored range that now collides with a live cycle comes back as a
      // 409 CYCLE_OVERLAP and stays archived; the message names the conflict.
      showToast({
        status: 'error',
        title: "Couldn't restore cycle",
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
      return false;
    }
  };

  if (isPending) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <Loader variant="spinner" size={28} label="Loading cycle" />
      </div>
    );
  }

  if (isError || !cycle) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <ErrorState
          title="Couldn't load cycle"
          description="We ran into a problem fetching this cycle."
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => refetch()}
              className="h-8 gap-2 rounded-md border-ds-border bg-ds-surface px-3 text-xs font-semibold"
            >
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-5">
      <CycleDetailHeader
        slug={slug}
        cycle={cycle}
        onLifecycleAction={runLifecycleAction}
      />

      {/* Goal is editable while the cycle is Planned or Active: a completed
          cycle is read-only at the API until it is reopened, and archived
          cycles stay frozen. The rail's dates follow the same rule. */}
      <div className="flex w-full min-h-0 flex-1 flex-col gap-6 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
          <CycleGoalSection
            goal={cycle.goal}
            editable={!cycle.archivedAt && cycle.status !== 'COMPLETED'}
            onSave={saveGoal}
          />

          <div className="h-px w-full bg-ds-border" aria-hidden />

          {/* The cycle's roster — read-only here; adding issues happens on
              the Issues page, which owns the create flow. */}
          <CycleIssuesList
            issues={issuesQuery.data?.issues ?? []}
            loading={issuesQuery.isPending}
            error={issuesQuery.isError}
            onRetry={() => issuesQuery.refetch()}
            onOpenIssue={(issue) =>
              router.push(`/w/${slug}/issues/${issue.id}`)
            }
          />
        </div>

        <CyclePropertiesRail
          cycle={cycle}
          statusCounts={statusCounts}
          progressLoading={issuesQuery.isPending}
          editable={!cycle.archivedAt && cycle.status !== 'COMPLETED'}
          onSaveDates={saveDates}
          // Archive is legal on Planned and Completed; Delete only on a
          // future Planned (its issues are merely unassigned, and the name is
          // released), which is why the range has to be in the future.
          onArchive={canManage ? () => setArchiveOpen(true) : undefined}
          onDelete={
            canManage && canDelete ? () => setDeleteOpen(true) : undefined
          }
          onRestore={canManage ? restore : undefined}
        />
      </div>

      <ArchiveCycleDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        slug={slug}
        cycle={cycle}
        onArchived={() => router.push(`/w/${slug}/cycles`)}
      />
      <DeleteCycleDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        slug={slug}
        cycle={cycle}
        // Left undefined until the archived count lands, so the copy falls
        // back to the count-free wording rather than an understated number.
        issueCount={
          canDelete && !archivedIssuesQuery.isPending
            ? cycle.progress.total +
              (archivedIssuesQuery.data?.issues.length ?? 0)
            : undefined
        }
        onDeleted={() => router.push(`/w/${slug}/cycles`)}
      />
    </div>
  );
}
