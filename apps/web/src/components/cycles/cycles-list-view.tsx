'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CalendarRange,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  RotateCw,
} from 'lucide-react';
import type { CycleCard, CycleStatus } from '@shipyard/shared';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import type { CycleFilters } from '@/components/cycles/cycles-toolbar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const GROUP_ORDER: CycleStatus[] = ['PLANNED', 'ACTIVE', 'COMPLETED'];

// Group dot + progress-bar tones, read off "Cycles Grouped List" in
// shipyard.pen: Planned → brand dot / warning bar, Active → info, Completed →
// success.
const GROUP_META: Record<
  CycleStatus,
  { label: string; dot: string; bar: string }
> = {
  PLANNED: { label: 'Planned', dot: 'bg-ds-brand', bar: 'bg-ds-warning' },
  ACTIVE: { label: 'Active', dot: 'bg-ds-info', bar: 'bg-ds-info' },
  COMPLETED: {
    label: 'Completed',
    dot: 'bg-ds-success',
    bar: 'bg-ds-success',
  },
};

/**
 * Progress shown on a row. The API derives `{ total, completed, percent }`
 * from the cycle's non-archived issues and returns `percent: null` when the
 * cycle tracks no issues — display that as 0%, never a dash.
 *
 * Deliberately NOT forced to 100% for COMPLETED cycles: completing a cycle
 * leaves unfinished issues open (spec rule 9), so a completed cycle can
 * legitimately read 65%.
 */
function progressPercent(cycle: CycleCard): number {
  return cycle.progress.percent ?? 0;
}

/** "Dec 15 – Dec 28" (en dash, day precision) per the design's Cycle Dates. */
function formatRange(start: string, end: string): string {
  const fmt = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

function CycleRow({
  cycle,
  bar,
  muted,
  onOpen,
}: {
  cycle: CycleCard;
  bar: string;
  /** Completed rows render their name muted + regular per the design. */
  muted?: boolean;
  onOpen: () => void;
}) {
  const pct = progressPercent(cycle);
  return (
    <div
      onClick={onOpen}
      className="flex h-12 cursor-pointer items-center gap-3 border-b border-ds-border/70 px-4 transition-colors last:border-b-0 hover:bg-ds-bg"
    >
      <RefreshCw
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground"
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[12.5px] leading-none',
          muted
            ? 'font-normal text-muted-foreground'
            : 'font-medium text-foreground',
        )}
      >
        {cycle.name}
      </span>

      {/* Progress + dates collapse on small screens (sm/md+) so the row never
          scrolls sideways — the name stays readable. */}
      <span className="hidden shrink-0 items-center gap-3 sm:flex">
        <span
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${cycle.name} progress`}
          className="h-1.5 w-20 shrink-0 rounded-full bg-[#E8E5DE]"
        >
          <span
            aria-hidden
            className={cn('block h-full rounded-full', bar)}
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="w-8 shrink-0 font-mono text-[10px] leading-none text-muted-foreground">
          {pct}%
        </span>
      </span>
      <span className="hidden w-[96px] shrink-0 text-right text-[11.5px] leading-none text-muted-foreground md:block">
        {formatRange(cycle.startDate, cycle.endDate)}
      </span>
    </div>
  );
}

/**
 * Cycles List view — grouped by lifecycle status (Planned / Active /
 * Completed) per "Cycles Grouped List" in shipyard.pen. Same anatomy as
 * ProjectListView / IssuesListView: collapsible groups, centered
 * loading/error/empty states, and a `+` on the group that can still receive
 * new rows.
 *
 * Groups arrive pre-filtered by scope (non-archived or archived) from the
 * parent; here we apply the search box client-side, because the list endpoint
 * exposes no `q` param. Rows keep the server's order within a group.
 */
export function CyclesListView({
  cycles,
  filters,
  loading = false,
  error = false,
  onRetry,
  onOpenCycle,
  onAddCycle,
}: {
  cycles: CycleCard[];
  filters: CycleFilters;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onOpenCycle?: (cycle: CycleCard) => void;
  onAddCycle?: () => void;
}) {
  const { search } = filters;
  const visibleCycles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query === '') return cycles;
    return cycles.filter((cycle) => cycle.name.toLowerCase().includes(query));
  }, [cycles, search]);

  const grouped = useMemo(() => {
    const byStatus = new Map<CycleStatus, CycleCard[]>(
      GROUP_ORDER.map((status) => [status, []]),
    );
    for (const cycle of visibleCycles) byStatus.get(cycle.status)?.push(cycle);
    // Only non-empty groups render — searching/filtering collapses the rest.
    return GROUP_ORDER.map((status) => ({
      status,
      cycles: byStatus.get(status) ?? [],
    })).filter((group) => group.cycles.length > 0);
  }, [visibleCycles]);

  const [collapsed, setCollapsed] = useState<Set<CycleStatus>>(new Set());
  const toggle = (status: CycleStatus) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });

  const hasActiveFilters = search.trim() !== '';
  const showEmpty = !loading && !error && visibleCycles.length === 0;
  const centered = showEmpty || error || loading;

  return (
    <div className="flex h-full w-full flex-col">
      {/* The list owns its scroll area, like Projects/Issues: header and
          toolbar hold still and only the rows move. */}
      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          centered && 'flex flex-col items-center justify-center',
        )}
      >
        {loading ? (
          <Loader2
            aria-label="Loading cycles"
            className="size-6 animate-spin text-muted-foreground"
          />
        ) : error ? (
          <ErrorState
            title="Couldn't load cycles"
            description="We ran into a problem fetching the cycle list. Try again in a moment."
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
            icon={CalendarRange}
            title={hasActiveFilters ? 'No cycles match' : 'No cycles yet'}
            description={
              hasActiveFilters
                ? 'Try a different name or clear the filters.'
                : 'Create your first cycle to plan a fixed iteration.'
            }
          />
        ) : (
          grouped.map((group) => {
            const meta = GROUP_META[group.status];
            const isCollapsed = collapsed.has(group.status);
            return (
              <section key={group.status} aria-label={meta.label}>
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
                      className={cn('size-2 shrink-0 rounded-full', meta.dot)}
                    />
                    <span className="text-[12.5px] font-semibold leading-none text-foreground">
                      {meta.label}
                    </span>
                    <span className="font-mono text-[10px] font-semibold leading-none text-ds-text-muted">
                      {group.cycles.length}
                    </span>
                  </button>
                  {/* Only Planned can receive new rows — creation always lands
                      PLANNED (spec §3.2), and completed cycles are read-only. */}
                  {group.status === 'PLANNED' ? (
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="New planned cycle"
                            onClick={onAddCycle}
                            className="grid size-6 shrink-0 place-items-center rounded-md text-ds-text-muted transition-colors hover:bg-ds-bg hover:text-foreground"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          New planned cycle
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
                        {group.cycles.map((cycle) => (
                          <CycleRow
                            key={cycle.id}
                            cycle={cycle}
                            bar={meta.bar}
                            muted={group.status === 'COMPLETED'}
                            onOpen={
                              onOpenCycle
                                ? () => onOpenCycle(cycle)
                                : () => undefined
                            }
                          />
                        ))}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
