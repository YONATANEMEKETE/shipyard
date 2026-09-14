'use client';

import { ArrowDownAZ, ArrowUpAZ, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface CycleFilters {
  search: string;
  order: 'asc' | 'desc';
}

/** Tab counts — computed by the parent from whatever feeds the list. */
export interface CycleScopeCounts {
  all: number;
  archived: number;
}

/**
 * Cycles toolbar — mirrors "Projects Toolbar Row" in shipyard.pen
 * (Screen / Cycles - List, DiiJw), minus the date pills:
 *  - Top row: underline scope tabs (All + count | Archived). No view switch —
 *    cycles have one list shape (there is no cycles kanban).
 *  - Bottom row: search + sort-direction toggle. Archived mode keeps the
 *    search only, like Projects.
 *
 * No Start/End date pills: the list endpoint's query schema is strict and
 * accepts only `status` / `archived` / `sort` / `order` — a date range would
 * have to be filtered client-side, which is not worth the divergence from what
 * the API can actually answer.
 *
 * Deliberately data-free: filter/scope state is lifted to the parent via
 * `onChange` / `onArchivedChange`, and the tab counts arrive as a prop, so the
 * toolbar renders the same against the API or a mock (IssuesToolbar pattern).
 * Sort field is fixed to `startDate` server-side; the toggle flips direction
 * only, and the default is newest-first (`desc`) per the design.
 */
export function CyclesToolbar({
  filters,
  onChange,
  archived = false,
  onArchivedChange,
  counts,
}: {
  filters: CycleFilters;
  onChange: (filters: CycleFilters) => void;
  /** Archived scope — read-only list of archived cycles (restore only). */
  archived?: boolean;
  onArchivedChange?: (archived: boolean) => void;
  counts?: CycleScopeCounts;
}) {
  const set = (patch: Partial<CycleFilters>) =>
    onChange({ ...filters, ...patch });

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Top row — scope tabs. Counts render per scope, like Projects/Issues. */}
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        {onArchivedChange ? (
          <Tabs
            value={archived ? 'ARCHIVED' : 'ACTIVE'}
            onValueChange={(details) =>
              onArchivedChange(details.value === 'ARCHIVED')
            }
          >
            <TabsList variant="underline">
              <TabsTrigger
                value="ACTIVE"
                className="gap-1.5 aria-selected:text-ds-brand"
              >
                All
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {counts?.all ?? 0}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="ARCHIVED"
                className="gap-1.5 aria-selected:text-ds-brand"
              >
                Archived
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {counts?.archived ?? 0}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </div>

      {/* Bottom row — search + sort toggle. Archived mode keeps the search
          only (read-only list). */}
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={filters.search}
            onChange={(value) => set({ search: value })}
            placeholder="Find cycles…"
            leftIcon={<Search className="size-[15px] text-ds-text-muted" />}
            classNames={{
              field:
                'h-[34px] w-full rounded-md border-ds-border bg-ds-surface sm:w-[160px]',
              input: 'text-xs',
            }}
          />

          {!archived ? (
            /* Sort direction toggle — flips asc/desc (field is fixed). */
            <button
              type="button"
              aria-label={`Sort ${
                filters.order === 'asc' ? 'descending' : 'ascending'
              }`}
              title={`Sort ${
                filters.order === 'asc' ? 'descending' : 'ascending'
              }`}
              onClick={() =>
                set({ order: filters.order === 'asc' ? 'desc' : 'asc' })
              }
              className="grid size-[34px] shrink-0 place-items-center rounded-md border border-ds-border bg-ds-surface text-muted-foreground transition-colors hover:border-ds-border-strong hover:text-foreground"
            >
              {filters.order === 'asc' ? (
                <ArrowUpAZ className="size-[15px]" />
              ) : (
                <ArrowDownAZ className="size-[15px]" />
              )}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
