'use client';

import type { CycleStatus } from '@shipyard/shared';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Loader } from '@/components/motion/loader';
import { CycleDetailHeader } from '@/components/cycles/cycle-detail-header';
import { useToast } from '@/components/providers/toast-provider';
import {
  useCompleteCycle,
  useCycle,
  useReopenCycle,
  useStartCycle,
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
 * label and the meta line advance together.
 *
 * The body (goal, issue list, progress card) and the properties rail come
 * next, so nothing renders below the header yet.
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

export function CycleDetailPage({
  slug,
  cycleId,
}: {
  slug: string;
  cycleId: string;
}) {
  const { data: cycle, isPending, isError, refetch } = useCycle(slug, cycleId);
  const { showToast } = useToast();

  // One hook per legal transition; the header's label already mirrors this
  // mapping, so only the write that matches the current status is ever used.
  const startCycle = useStartCycle(slug);
  const completeCycle = useCompleteCycle(slug);
  const reopenCycle = useReopenCycle(slug);

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
    </div>
  );
}
