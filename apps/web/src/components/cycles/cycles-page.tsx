'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  CyclesToolbar,
  type CycleFilters,
  type CycleScopeCounts,
} from '@/components/cycles/cycles-toolbar';
import { CyclesListView } from '@/components/cycles/cycles-list-view';
import { CreateCycleDialog } from '@/components/cycles/create-cycle-dialog';
import { useCycles } from '@/hooks/use-cycles';
import { useWorkspace } from '@/hooks/use-workspaces';

/**
 * Cycles page — header + toolbar + grouped list.
 * Mirrors Screen / Cycles - List in shipyard.pen (DiiJw). Header follows the
 * ProjectsPage / IssuesPage convention; the toolbar and list mirror the
 * Projects implementation (All/Archived scope, search + date filters + sort,
 * collapsible status groups) with the cycles-specific columns.
 *
 * Creating a cycle happens here (page or group `+` → CreateCycleDialog); the
 * mutation invalidates the list family, so a new PLANNED cycle appears in its
 * group without a manual refetch. A row opens that cycle's detail page.
 */
export function CyclesPage({ slug }: { slug: string }) {
  const router = useRouter();
  const { data: workspace } = useWorkspace(slug);
  // Create is OWNER|ADMIN only (api-design §4.1) — Members see no affordance.
  const canCreate = workspace?.role !== 'MEMBER';
  const [createOpen, setCreateOpen] = useState(false);

  const [filters, setFilters] = useState<CycleFilters>({
    search: '',
    order: 'desc',
  });
  // Archived scope — read-only list of archived cycles (restore only).
  const [archived, setArchived] = useState(false);

  // The list is grouped by status, so the only server-side params are the sort
  // field (fixed to `startDate`) and its direction — the endpoint's query
  // schema is strict and takes nothing else (no pagination — cycles are few).
  // Search and the date pills are applied client-side in the list view, since
  // the endpoint exposes neither a `q` nor a date-range filter.
  const listParams = {
    sort: 'startDate' as const,
    order: filters.order,
    ...(archived ? { archived: 'true' as const } : {}),
  };

  const cyclesQuery = useCycles(slug, listParams);

  // Tab counts are unfiltered totals per scope — the date pills narrow the
  // list without changing what each tab reports.
  const allCountQuery = useCycles(slug);
  const archivedCountQuery = useCycles(slug, { archived: 'true' });
  const counts: CycleScopeCounts = {
    all: allCountQuery.data?.cycles.length ?? 0,
    archived: archivedCountQuery.data?.cycles.length ?? 0,
  };

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-ds-brand">
        Cycles
      </span>

      {/* Header row — matches ProjectsPage / IssuesPage: eyebrow + 28px title */}
      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="text-[28px] font-bold leading-none tracking-[-1px] text-foreground">
            Cycles
          </h1>
          <p className="text-[13px] leading-[1.5] text-muted-foreground">
            Plan work in fixed iterations.
          </p>
        </div>

        {canCreate ? (
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90"
          >
            <Plus className="size-4" />
            New cycle
          </Button>
        ) : null}
      </div>

      <CyclesToolbar
        filters={filters}
        onChange={setFilters}
        archived={archived}
        onArchivedChange={setArchived}
        counts={counts}
      />

      {/* Content area — the grouped list owns its scroll. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <CyclesListView
          cycles={cyclesQuery.data?.cycles ?? []}
          filters={filters}
          loading={cyclesQuery.isPending}
          error={cyclesQuery.isError}
          onRetry={() => cyclesQuery.refetch()}
          onOpenCycle={(cycle) => router.push(`/w/${slug}/cycles/${cycle.id}`)}
          onAddCycle={canCreate ? () => setCreateOpen(true) : undefined}
        />
      </div>

      <CreateCycleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        slug={slug}
      />
    </div>
  );
}
