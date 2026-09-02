'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/hooks/use-workspaces';
import {
  useProjects,
  useProject,
  useViewPreference,
} from '@/hooks/use-projects';
import { CreateProjectDialog } from '@/components/projects/create-project-dialog';
import { ProjectListView } from '@/components/projects/project-list-view';
import { ProjectKanbanView } from '@/components/projects/project-kanban-view';
import { ProjectDetailPanel } from '@/components/projects/project-detail-panel';
import {
  ProjectsToolbar,
  type ProjectFilters,
} from '@/components/projects/projects-toolbar';

/**
 * Projects page — header + toolbar + list view.
 * Mirrors Screen / Projects - List in shipyard.pen.
 * Fetches the project list from the API in this parent component so both the
 * List view (now) and the Kanban view (next) can consume the same data. The
 * query drives loading/error/empty states; projects are passed down to the
 * active view rather than fetched inside it.
 */
export function ProjectsPage({ slug }: { slug: string }) {
  const { data: workspace } = useWorkspace(slug);
  const { data: viewPref } = useViewPreference(slug, 'PROJECT');
  const view = viewPref?.view ?? 'LIST';
  const canCreate = workspace?.role !== 'MEMBER';
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [filters, setFilters] = useState<ProjectFilters>({
    search: '',
    sort: 'createdAt',
    order: 'desc',
  });

  // Fetch the workspace's projects here (parent) so the list and kanban views
  // share one query. Filter params are passed server-side where the endpoint
  // supports them; search stays client-side in the list view.
  const projectsQuery = useProjects(slug, {
    status: filters.status,
    ownerId: filters.ownerId,
    startDate: filters.startDate,
    targetDate: filters.targetDate,
    sort: filters.sort,
    order: filters.order,
  });

  // Detail query — fetched on selection and passed to the always-present
  // detail panel, which shows a centered loader while it resolves.
  const projectQuery = useProject(slug, selectedProjectId);

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

      {/* Content area — 70/30 split: active view (List/Kanban) + always-present
          detail panel. Independent of the chosen view. */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Active view — 70% */}
        <div className="flex min-h-0 w-[70%] flex-col">
          {view === 'LIST' ? (
            <ProjectListView
              filters={filters}
              projects={projectsQuery.data?.projects ?? []}
              loading={projectsQuery.isPending}
              error={projectsQuery.isError}
              onRetry={projectsQuery.refetch}
              onOpenProject={(project) => setSelectedProjectId(project.id)}
            />
          ) : (
            <ProjectKanbanView
              onOpenProject={(id) => setSelectedProjectId(id)}
              loading={projectsQuery.isPending}
              error={projectsQuery.isError}
              onRetry={projectsQuery.refetch}
            />
          )}
        </div>

        {/* Detail panel — 30% (empty prompt until a project is selected) */}
        <div className="flex min-h-0 w-[30%] flex-col">
          <ProjectDetailPanel
            project={projectQuery.data ?? null}
            loading={selectedProjectId !== null && projectQuery.isPending}
            error={selectedProjectId !== null && projectQuery.isError}
            onRetry={projectQuery.refetch}
          />
        </div>
      </div>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        slug={slug}
      />
    </div>
  );
}
