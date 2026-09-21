'use client';

import { format } from 'date-fns';
import { Timer } from 'lucide-react';
import dynamic from 'next/dynamic';

import {
  ISSUE_STATUS_META,
  ISSUE_STATUS_ORDER,
  type IssueStatusCounts,
} from '@/components/cycles/cycle-progress';
import { cn } from '@/lib/utils';

/**
 * The Current Cycle card, presentational.
 *
 * Lifted out of the dashboard rail so the dashboard and the landing page render
 * the same card from one implementation: the dashboard feeds it the workspace's
 * live active cycle, the landing page feeds it sample numbers. Everything that
 * decides what to show — the query, the role rule, the empty and error states,
 * the create dialog — stays in `current-cycle-panel.tsx`; this module only draws.
 *
 * Header and body are separate exports because the panel shows the label even
 * when there is no cycle yet (the card still says what it is), while the body is
 * only meaningful with data.
 *
 * `echarts` is a heavy client-only dependency and both callers are first paint,
 * so the ring is lazy-loaded. The placeholder reserves the ring's box so nothing
 * shifts when it lands.
 */
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
 * The label strip: what the card is, and the days-left chip. The chip is
 * cycle-specific, so it only appears when a caller has one to report.
 */
export function CurrentCycleCardHeader({ daysLeft }: { daysLeft?: string }) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-ds-text-muted">
        Current Cycle
      </span>
      {daysLeft ? (
        <span className="inline-flex shrink-0 items-center gap-[5px] rounded-full bg-ds-warning-soft px-2 py-[3px] font-mono text-[10px] font-semibold leading-none text-ds-warning">
          <Timer aria-hidden className="size-[11px]" />
          {daysLeft}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The body: the cycle's name and date range, then the ring with its legend.
 *
 * The ring is sliced by *issue status* (Backlog → Done) rather than done/undone
 * — a cycle's progress is the mix of its issues, and the slices line up with the
 * groups on the Issues page. The API's inline `progress` carries only
 * `{ total, completed, percent }`, so per-status counts come from the cycle's
 * issue list, the same fetch and the same derivation the cycle detail page uses
 * ("the cycle's issues, only for the ring's status breakdown").
 */
export function CurrentCycleCardBody({
  name,
  startDate,
  endDate,
  percent,
  statusCounts,
  completed,
  total,
}: {
  name: string;
  startDate: string;
  endDate: string;
  percent: number;
  statusCounts: IssueStatusCounts;
  completed: number;
  total: number;
}) {
  const range = `${format(new Date(`${startDate}T12:00:00`), 'MMM d')} → ${format(
    new Date(`${endDate}T12:00:00`),
    'MMM d',
  )}`;

  return (
    <>
      {/* Name + dates. */}
      <div className="flex w-full items-center justify-between gap-3">
        <span className="truncate text-[15px] font-semibold leading-none text-foreground">
          {name}
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
