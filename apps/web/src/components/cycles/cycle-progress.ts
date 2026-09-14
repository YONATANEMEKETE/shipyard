import type { CycleCard, CycleStatus, IssueStatus } from '@shipyard/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Shared presentation helpers for cycles. The list, the detail header and the
// properties rail all render the same cycle, so the group tones, the progress
// fallback and the length copy live here rather than being re-derived per
// component (the `project-progress.ts` precedent).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Group dot + progress-bar tones, read off "Cycles Grouped List" and the
 * Progress Card in shipyard.pen: Planned → brand dot / warning bar, Active →
 * info, Completed → success.
 */
export const CYCLE_GROUP_META: Record<
  CycleStatus,
  { label: string; dot: string; bar: string }
> = {
  PLANNED: { label: 'Planned', dot: 'bg-ds-brand', bar: 'bg-ds-warning' },
  ACTIVE: { label: 'Active', dot: 'bg-ds-info', bar: 'bg-ds-info' },
  COMPLETED: { label: 'Completed', dot: 'bg-ds-success', bar: 'bg-ds-success' },
};

/**
 * Progress shown for a cycle. The API derives `{ total, completed, percent }`
 * from the cycle's non-archived issues and returns `percent: null` when none
 * are tracked — displayed as 0%, never a dash.
 *
 * Deliberately NOT forced to 100% for COMPLETED cycles: completing a cycle
 * leaves unfinished issues open (spec rule 9), so a completed cycle can
 * legitimately read 65%.
 */
export function cycleProgressPercent(
  cycle: Pick<CycleCard, 'progress'>,
): number {
  return cycle.progress.percent ?? 0;
}

/**
 * Inclusive day count — a one-day cycle is a 1-day cycle (day-precision dates
 * compare lexicographically in the shared `YYYY-MM-DD` shape).
 */
export function cycleLengthDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T12:00:00`).getTime();
  const end = new Date(`${endDate}T12:00:00`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

/** "14-day cycle" — the detail header's meta-line phrasing. */
export function cycleLengthLabel(startDate: string, endDate: string): string {
  return `${cycleLengthDays(startDate, endDate)}-day cycle`;
}

// ── Issue-status slices ──
//
// The Progress Card's ring is sliced by *issue* status, not by cycle status:
// a cycle's progress is the mix of its issues, and the slices line up with the
// groups on the Issues page (same order, same tones). Mirrors `GROUP_META` in
// components/issues/issues-list-view.tsx — kept separate because that map owns
// table chrome (labels, dots) and this one also carries a CSS value for the
// chart, which reads colors off the DOM rather than from Tailwind classes.

export const ISSUE_STATUS_ORDER = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'DONE',
] as const satisfies readonly IssueStatus[];

export const ISSUE_STATUS_META: Record<
  IssueStatus,
  { label: string; dot: string; chart: string }
> = {
  BACKLOG: {
    label: 'Backlog',
    dot: 'bg-ds-text-muted',
    chart: 'var(--ds-text-muted)',
  },
  TODO: { label: 'Todo', dot: 'bg-ds-info', chart: 'var(--ds-info)' },
  IN_PROGRESS: {
    label: 'In Progress',
    dot: 'bg-ds-brand',
    chart: 'var(--ds-brand)',
  },
  DONE: { label: 'Done', dot: 'bg-ds-success', chart: 'var(--ds-success)' },
};

/** Per-status counts for one cycle — `Record<IssueStatus, number>`. */
export type IssueStatusCounts = Record<IssueStatus, number>;

/** Zeroed counts, so the card has a stable shape before the query resolves. */
export function emptyStatusCounts(): IssueStatusCounts {
  return { BACKLOG: 0, TODO: 0, IN_PROGRESS: 0, DONE: 0 };
}
