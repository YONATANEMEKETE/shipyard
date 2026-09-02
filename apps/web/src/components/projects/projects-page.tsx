'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/hooks/use-workspaces';
import { useViewPreference } from '@/hooks/use-projects';
import { CreateProjectDialog } from '@/components/projects/create-project-dialog';
import { ProjectListView } from '@/components/projects/project-list-view';
import {
  ProjectsToolbar,
  type ProjectFilters,
} from '@/components/projects/projects-toolbar';

/**
 * Projects page — header + toolbar + list view.
 * Mirrors Screen / Projects - List in shipyard.pen:
 *  - Title 24px / 700 / -0.5 tracking, subtitle 13px muted
 *  - Primary "New project" button (Button / Primary, plus icon, 12px 600)
 *  - Toolbar row: search left, List/Kanban view switch + filter/sort controls right
 *  - Projects list table, driven by mock data until the live query is wired in
 *  - Permission-gated: MEMBER cannot create (api-design #3)
 * Filter/view state is lifted here so the list/board view can consume it; the
 * toolbar persists the view choice server-side, and the page renders the list
 * view when LIST is active.
 */
export function ProjectsPage({ slug }: { slug: string }) {
  const { data: workspace } = useWorkspace(slug);
  const { data: viewPref } = useViewPreference(slug, 'PROJECT');
  const canCreate = workspace?.role !== 'MEMBER';
  const [createOpen, setCreateOpen] = useState(false);
  const [filters, setFilters] = useState<ProjectFilters>({
    search: '',
    sort: 'createdAt',
    order: 'desc',
  });

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-ds-brand">
        Projects
      </span>

      {/* Header row — matches MembersPage / SettingsForm: eyebrow + 28px title */}
      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="text-[28px] font-bold leading-none tracking-[-1px] text-foreground">
            Projects
          </h1>
          <p className="text-[13px] leading-[1.5] text-muted-foreground">
            Track initiatives across your workspace.
          </p>
        </div>

        {canCreate ? (
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90"
          >
            <Plus className="size-4" />
            New project
          </Button>
        ) : null}
      </div>

      {/* Toolbar row — search + view switch + filter/sort controls */}
      <ProjectsToolbar slug={slug} filters={filters} onChange={setFilters} />

      {/* List view (mock data) — rendered when LIST view is active */}
      {(viewPref?.view ?? 'LIST') === 'LIST' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <ProjectListView filters={filters} />
        </div>
      ) : null}

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        slug={slug}
      />
    </div>
  );
}
