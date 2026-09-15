'use client';

import { useQueryClient } from '@tanstack/react-query';
import { FolderKanban, Plus, RotateCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Fragment, useState } from 'react';
import type { ProjectCard } from '@shipyard/shared';

import { CreateProjectDialog } from '@/components/projects/create-project-dialog';
import { displayProgress } from '@/components/projects/project-progress';
import {
  RailSectionHeader,
  ViewAllLink,
} from '@/components/dashboard/rail-section-header';
import { Loader } from '@/components/motion/loader';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { dashboardKeys, useDashboard } from '@/hooks/use-dashboard';
import { useWorkspace } from '@/hooks/use-workspaces';

/**
 * Active Projects — the rail's second section, mirroring "Active Projects" in
 * `Screen / Dashboard` (s4L8ST): a heading row, then compact project rows of
 * name · progress track · percent.
 *
 * Three rows, per the frame. The API sends up to 20 (`listActive`, hard cap),
 * so the preview is capped here and "View all" is the way to the rest.
 *
 * Unlike the Current Cycle card this section has no panel chrome — the frame
 * draws it straight on the hub surface, so the rows carry a hover fill instead
 * of a border.
 *
 * A row opens the projects page's inline detail panel for that project, via the
 * same `?project=<id>` deep link global search uses (search-dialog.tsx): the
 * page reads it as `initialProjectId` and opens the panel on mount. `%` comes
 * from `displayProgress`, so a COMPLETED project reads 100% here exactly as it
 * does on the projects page.
 */

/** The hub is a preview — three rows, with "View all" as the way to the rest. */
const MAX_PROJECTS = 3;

function ProjectRow({
  project,
  onOpen,
}: {
  project: ProjectCard;
  onOpen: () => void;
}) {
  const pct = displayProgress(project);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-11 w-full items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-ds-bg/60"
    >
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-none text-foreground">
        {project.name}
      </span>

      <span
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${project.name} progress`}
        className="h-1.5 w-[72px] shrink-0 rounded-full bg-ds-border"
      >
        <span
          aria-hidden
          className="block h-full rounded-full bg-ds-brand"
          style={{ width: `${pct}%` }}
        />
      </span>

      <span className="w-[34px] shrink-0 text-right font-mono text-[11px] leading-none text-ds-text-muted">
        {pct}%
      </span>
    </button>
  );
}

export function ActiveProjectsPanel({ slug }: { slug: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useDashboard(slug);
  const { data: workspace } = useWorkspace(slug);
  const [createOpen, setCreateOpen] = useState(false);

  // "Create Project" is OWNER|ADMIN only (api-design §4.1) — a Member gets the
  // message without an action they could never complete.
  const canCreate = workspace?.role !== 'MEMBER';
  const projects = query.data?.activeProjects ?? [];
  const preview = projects.slice(0, MAX_PROJECTS);

  // `useCreateProject` invalidates the project list family only; the hub keeps
  // its own cache entry, so it has to be refreshed explicitly.
  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    }
  };

  return (
    <section
      aria-label="Active projects"
      className="flex w-full flex-col gap-4"
    >
      <RailSectionHeader
        label="Active Projects"
        action={<ViewAllLink href={`/w/${slug}/projects`} label="View all" />}
      />

      {query.isPending ? (
        <div className="flex min-h-[152px] w-full items-center justify-center">
          <Loader size={28} variant="spinner" label="Loading active projects" />
        </div>
      ) : query.isError ? (
        <div className="flex min-h-[152px] w-full items-center justify-center">
          <ErrorState
            title="Couldn't load projects"
            description="We ran into a problem fetching this workspace's active projects."
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => query.refetch()}
                className="h-8 gap-2 rounded-md border-ds-border bg-ds-surface px-3 text-xs font-semibold text-foreground"
              >
                <RotateCw className="size-3.5" />
                Try again
              </Button>
            }
          />
        </div>
      ) : preview.length === 0 ? (
        // No active projects is data, not an error (spec rule 5).
        <EmptyState
          icon={FolderKanban}
          title={
            canCreate
              ? 'No active projects available'
              : 'No active projects are currently available'
          }
          description={
            canCreate ? 'Create a project to start organizing work.' : undefined
          }
          action={
            canCreate ? (
              <Button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90"
              >
                <Plus className="size-4" />
                New project
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex w-full flex-col">
          {preview.map((project, index) => (
            <Fragment key={project.id}>
              <ProjectRow
                project={project}
                // Same deep link global search uses — the projects page opens
                // its detail panel for `?project=<id>`.
                onOpen={() =>
                  router.push(`/w/${slug}/projects?project=${project.id}`)
                }
              />
              {index < preview.length - 1 ? (
                <span className="h-px w-full shrink-0 bg-ds-border" />
              ) : null}
            </Fragment>
          ))}
        </div>
      )}

      {canCreate ? (
        <CreateProjectDialog
          open={createOpen}
          onOpenChange={handleCreateOpenChange}
          slug={slug}
        />
      ) : null}
    </section>
  );
}
