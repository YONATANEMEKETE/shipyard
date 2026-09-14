'use client';

import { format } from 'date-fns';
import {
  Archive,
  Calendar as CalendarIcon,
  Hourglass,
  RotateCw,
  Trash2,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

import type { CycleDetail } from '@shipyard/shared';

import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import {
  StatefulButton,
  type ButtonState,
} from '@/components/motion/button/stateful';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toYmd } from '@/components/projects/date-picker-field';
import {
  CYCLE_GROUP_META,
  cycleLengthDays,
  cycleProgressPercent,
  ISSUE_STATUS_META,
  ISSUE_STATUS_ORDER,
  type IssueStatusCounts,
} from '@/components/cycles/cycle-progress';

// `echarts` is a heavy client-only dependency and the gauge is below the fold
// on a page that must paint fast — load it on demand instead of in the rail's
// own chunk. The placeholder reserves the ring's box so nothing shifts.
const CycleProgressChart = dynamic(
  () =>
    import('@/components/cycles/cycle-progress-chart').then(
      (mod) => mod.CycleProgressChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="mx-auto aspect-square w-full max-w-[168px] shrink-0 rounded-full bg-ds-surface-subtle"
      />
    ),
  },
);

/** How long the restore button holds each beat before settling. */
const SUCCESS_HOLD = 700;
const ERROR_HOLD = 1600;

/**
 * Cycles properties rail — "Progress Card" + "Cycle Properties Card" from
 * shipyard.pen (Screen / Cycles - Detail, OEV9C): a 320px column holding the
 * derived progress summary and the details rows.
 *
 * Read-only except for the two dates. Status has no inline control by design —
 * it changes only through a lifecycle action (spec D2) — and Duration/Created
 * are derived or server-owned. Start and End edit through the same
 * popover-calendar row the issue rail uses for its dates.
 *
 * Presentational — the parent owns the write and resolves to a boolean, so the
 * rail never has to hold an error state of its own.
 */
export function CyclePropertiesRail({
  cycle,
  statusCounts,
  progressLoading = false,
  editable = true,
  onSaveDates,
  onArchive,
  onDelete,
  onRestore,
}: {
  cycle: CycleDetail;
  /** The cycle's issues grouped by status — drives the ring's slices. */
  statusCounts: IssueStatusCounts;
  /** True while the issues query is in flight, so the ring can hold its box. */
  progressLoading?: boolean;
  /** False for a completed or archived cycle — the API rejects those PATCHes. */
  editable?: boolean;
  onSaveDates: (patch: {
    startDate?: string;
    endDate?: string;
  }) => Promise<boolean>;
  /** Opens the archive confirm. Omitted for a member, or an Active cycle. */
  onArchive?: () => void;
  /** Opens the delete confirm. Omitted unless the cycle is a future Planned. */
  onDelete?: () => void;
  /** Restores an archived cycle in place. Resolves false on failure. */
  onRestore?: () => Promise<boolean>;
}) {
  const percent = cycleProgressPercent(cycle);
  const { total, completed } = cycle.progress;
  const statusMeta = CYCLE_GROUP_META[cycle.status];

  // Restore is the one lifecycle write that happens in place (no confirm —
  // restoring is non-destructive), so it owns a beat here like the header's
  // action. Archive and Delete open confirms instead.
  const [restoreState, setRestoreState] = useState<ButtonState>('idle');
  const restoreTimer = useRef<number | null>(null);
  const clearRestoreTimer = () => {
    if (restoreTimer.current !== null) {
      window.clearTimeout(restoreTimer.current);
      restoreTimer.current = null;
    }
  };
  useEffect(() => clearRestoreTimer, []);

  const runRestore = async () => {
    if (!onRestore || restoreState === 'loading') return;
    clearRestoreTimer();
    setRestoreState('loading');
    const ok = await onRestore();
    setRestoreState(ok ? 'success' : 'error');
    restoreTimer.current = window.setTimeout(
      () => {
        restoreTimer.current = null;
        setRestoreState('idle');
      },
      ok ? SUCCESS_HOLD : ERROR_HOLD,
    );
  };

  const isArchived = Boolean(cycle.archivedAt);
  const showRestore = isArchived && Boolean(onRestore);
  const showArchive = !isArchived && Boolean(onArchive);
  const showDelete = !isArchived && Boolean(onDelete);

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Progress card — derived from issues, never stored (data-model D8). */}
      <section
        aria-label="Progress"
        className="flex w-full flex-col gap-3 rounded-xl border border-ds-border bg-ds-bg p-4"
      >
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[1px] text-muted-foreground">
          Progress
        </span>

        {progressLoading ? (
          <div
            aria-hidden
            className="mx-auto aspect-square w-full max-w-[168px] shrink-0 rounded-full bg-ds-surface-subtle"
          />
        ) : (
          <CycleProgressChart percent={percent} statusCounts={statusCounts} />
        )}

        <p className="w-full text-center font-mono text-[11px] tabular-nums text-muted-foreground">
          {total === 0 ? 'No issues tracked' : `${completed} of ${total} done`}
        </p>

        {/* Legend — the ring is sliced by issue status, so the key doubles as
            the breakdown: same labels, order and tones as the Issues groups. */}
        <ul className="flex w-full flex-col gap-1 pt-1">
          {ISSUE_STATUS_ORDER.map((status) => {
            const meta = ISSUE_STATUS_META[status];
            return (
              <li
                key={status}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn('size-2 shrink-0 rounded-full', meta.dot)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {meta.label}
                  </span>
                </span>
                <span className="font-mono text-xs font-medium tabular-nums text-foreground">
                  {statusCounts[status]}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Details — borderless rows, matching the issue rail. */}
      <section
        aria-label="Cycle details"
        className="flex w-full flex-col gap-2.5 pt-1"
      >
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[1px] text-muted-foreground">
          Details
        </span>

        <div className="flex items-center justify-between gap-2.5">
          <span className="text-xs text-muted-foreground">Status</span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn('size-2 rounded-full', statusMeta.dot)}
            />
            <span className="font-mono text-xs font-medium text-foreground">
              {statusMeta.label}
            </span>
          </span>
        </div>

        <DateRow
          label="Start date"
          value={cycle.startDate}
          editable={editable}
          onSelect={(value) => onSaveDates({ startDate: value })}
        />

        <DateRow
          label="End date"
          value={cycle.endDate}
          editable={editable}
          onSelect={(value) => onSaveDates({ endDate: value })}
        />

        <div className="flex items-center justify-between gap-2.5">
          <span className="text-xs text-muted-foreground">Duration</span>
          <span className="flex items-center gap-1.5">
            <Hourglass
              aria-hidden
              className="size-3 shrink-0 text-muted-foreground"
            />
            <span className="font-mono text-xs font-medium tabular-nums text-foreground">
              {cycleLengthDays(cycle.startDate, cycle.endDate)} days
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between gap-2.5">
          <span className="text-xs text-muted-foreground">Created</span>
          <span className="font-mono text-xs font-medium tabular-nums text-foreground">
            {format(new Date(cycle.createdAt), 'MMM d, yyyy')}
          </span>
        </div>
      </section>

      {/* Lifecycle — pushed to the bottom of the rail, divider first, per the
          pen's "Lifecycle Section". Rows appear only where the transition is
          legal: no Archive on an Active cycle (complete first), no Delete once
          the range has started, and Restore replaces both while archived. */}
      {showRestore || showArchive || showDelete ? (
        <>
          <div className="flex-1" aria-hidden />
          <section
            aria-label="Lifecycle"
            className="flex w-full flex-col gap-0.5"
          >
            <div className="h-px w-full bg-ds-border" aria-hidden />
            {showRestore ? (
              <StatefulButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={runRestore}
                className="w-full justify-start gap-2 rounded-md px-2 py-[9px] text-[12.5px] font-medium hover:bg-ds-bg"
                state={restoreState}
                loadingText="Restoring…"
                successText="Restored"
                icon={<RotateCw className="size-3.5 shrink-0" />}
              >
                Restore cycle
              </StatefulButton>
            ) : null}
            {showArchive ? (
              <button
                type="button"
                onClick={onArchive}
                className="flex w-full items-center gap-2 rounded-md px-2 py-[9px] text-left text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-ds-bg hover:text-foreground"
              >
                <Archive aria-hidden className="size-3.5 shrink-0" />
                Archive cycle
              </button>
            ) : null}
            {showDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="flex w-full items-center gap-2 rounded-md px-2 py-[9px] text-left text-[12.5px] font-medium text-ds-danger transition-colors hover:bg-ds-danger-soft"
              >
                <Trash2 aria-hidden className="size-3.5 shrink-0" />
                Delete cycle
              </button>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

/**
 * A date row. Editable rows open the shared calendar in a popover and PATCH the
 * single changed date (the update schema takes a partial body); read-only rows
 * render the same value without the affordance, so a completed cycle shows the
 * range without offering a control the API would reject.
 */
function DateRow({
  label,
  value,
  editable,
  onSelect,
}: {
  label: string;
  value: string;
  editable: boolean;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = new Date(`${value}T12:00:00`);
  const display = format(selected, 'MMM d, yyyy');

  if (!editable) {
    return (
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="flex items-center gap-1.5">
          <CalendarIcon
            aria-hidden
            className="size-3 shrink-0 text-muted-foreground"
          />
          <span className="font-mono text-xs font-medium tabular-nums text-foreground">
            {display}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Change ${label.toLowerCase()}`}
            className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 font-mono text-xs font-medium tabular-nums text-foreground transition-colors hover:text-ds-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CalendarIcon
              aria-hidden
              className="size-3 shrink-0 text-muted-foreground"
            />
            {display}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-auto border-ds-border bg-ds-surface p-0 shadow-xl"
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              if (date) onSelect(toYmd(date));
              setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
