import { useMemo } from 'react';
import {
  CornerDownRight,
  FolderKanban,
  Loader2,
  Plus,
  RotateCw,
} from 'lucide-react';
import type { ProjectCard, ProjectStatus } from '@shipyard/shared';

import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Button } from '@/components/ui/button';
import type { ProjectFilters } from '@/components/projects/projects-toolbar';
import { displayProgress } from '@/components/projects/project-progress';
import { cn } from '@/lib/utils';

const GROUP_ORDER: ProjectStatus[] = ['PLANNED', 'ACTIVE', 'COMPLETED'];

const GROUP_META: Record<
  ProjectStatus,
  { label: string; dot: string; bar: string }
> = {
  // Mirrors the grouped list in shipyard.pen (Screen / Projects - List):
  // Planned → info dot/bar, Active → brand dot + warning bar,
  // Completed → success dot/bar.
  PLANNED: { label: 'Planned', dot: 'bg-ds-info', bar: 'bg-ds-info' },
  ACTIVE: { label: 'Active', dot: 'bg-ds-brand', bar: 'bg-ds-warning' },
  COMPLETED: { label: 'Completed', dot: 'bg-ds-success', bar: 'bg-ds-success' },
};

// Owner avatar tones — deterministic per user so rows stay stable across
// renders, echoing the varied avatars in the design.
const AVATAR_TONES = [
  'bg-ds-brand',
  'bg-ds-info',
  'bg-ds-warning',
  'bg-ds-success',
] as const;

function toneFor(userId: string): (typeof AVATAR_TONES)[number] {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1)
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

function formatTargetDate(value: string | null): string {
  if (!value) return '—';
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function ProjectRow({
  project,
  bar,
  muted,
  onOpen,
}: {
  project: ProjectCard;
  bar: string;
  /** Completed rows render their name muted + regular per the design. */
  muted?: boolean;
  onOpen: () => void;
}) {
  // Backend-derived from non-archived issue counts; display rules
  // (COMPLETED → 100%, untracked → 0%) live in displayProgress.
  const pct = displayProgress(project);
  return (
    <div
      onClick={onOpen}
      className="flex h-12 min-w-[560px] cursor-pointer items-center gap-3 border-b border-ds-border/70 px-4 transition-colors last:border-b-0 hover:bg-ds-bg md:min-w-0"
    >
      <CornerDownRight
        aria-hidden
        className="size-[15px] shrink-0 text-muted-foreground"
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[12.5px] leading-none',
          muted
            ? 'font-normal text-muted-foreground'
            : 'font-medium text-foreground',
        )}
      >
        {project.name}
      </span>

      {project.owner.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={project.owner.image}
          alt=""
          className="size-5 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-full font-mono text-[8px] font-bold text-white',
            toneFor(project.owner.userId),
          )}
        >
          {initialsOf(project.owner.name)}
        </span>
      )}

      <span
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${project.name} progress`}
        className="h-1.5 w-20 shrink-0 rounded-full bg-[#E8E5DE]"
      >
        <span
          aria-hidden
          className={cn('block h-full rounded-full', bar)}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-8 shrink-0 text-[10px] leading-none text-muted-foreground">
        {pct}%
      </span>
      <span className="w-14 shrink-0 text-[11.5px] leading-none text-muted-foreground">
        {formatTargetDate(project.targetDate)}
      </span>
    </div>
  );
}

/**
 * Projects List view — grouped by status (Planned / Active / Completed) per
 * "Projects Grouped List" in shipyard.pen. The parent owns the server-side
 * filter params; here we apply the client-side text search (the list endpoint
 * has no search param) so the toolbar responds live.
 * `loading` renders a centered spinner, `error` renders the ErrorState, an
 * empty result renders the EmptyState. Row click opens the detail panel;
 * the group + opens the create dialog preset to that status.
 */
export function ProjectListView({
  projects,
  filters,
  loading = false,
  error = false,
  onRetry,
  onOpenProject,
  onAddProject,
}: {
  projects: ProjectCard[];
  filters: ProjectFilters;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onOpenProject?: (project: ProjectCard) => void;
  onAddProject?: (status: ProjectStatus) => void;
}) {
  const visibleProjects = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    if (query === '') return projects;
    return projects.filter((project: ProjectCard) =>
      project.name.toLowerCase().includes(query),
    );
  }, [projects, filters.search]);

  const grouped = useMemo(() => {
    const byStatus = new Map<ProjectStatus, ProjectCard[]>(
      GROUP_ORDER.map((status) => [status, []]),
    );
    for (const project of visibleProjects)
      byStatus.get(project.status)?.push(project);
    // Only non-empty groups render — searching/filtering collapses the rest.
    return GROUP_ORDER.map((status) => ({
      status,
      projects: byStatus.get(status) ?? [],
    })).filter((group) => group.projects.length > 0);
  }, [visibleProjects]);

  const hasActiveFilters = filters.search.trim() !== '';
  const showEmpty = !loading && !error && visibleProjects.length === 0;
  const centered = showEmpty || error || loading;

  return (
    <div className="flex h-full w-full flex-col overflow-x-auto">
      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          centered && 'flex flex-col items-center justify-center',
        )}
      >
        {loading ? (
          <Loader2
            aria-label="Loading projects"
            className="size-6 animate-spin text-muted-foreground"
          />
        ) : error ? (
          <ErrorState
            title="Couldn't load projects"
            description="We ran into a problem fetching the project list. Try again in a moment."
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
            icon={FolderKanban}
            title={hasActiveFilters ? 'No projects match' : 'No projects yet'}
            description={
              hasActiveFilters
                ? 'Try a different name — or clear the search.'
                : 'Create your first project to start tracking initiatives.'
            }
          />
        ) : (
          grouped.map((group) => {
            const meta = GROUP_META[group.status];
            return (
              <section key={group.status} aria-label={meta.label}>
                <div className="flex h-9 items-center gap-2 border-b border-ds-border bg-ds-surface-subtle px-4">
                  <span
                    aria-hidden
                    className={cn('size-2 rounded-full', meta.dot)}
                  />
                  <span className="text-[12.5px] font-semibold leading-none text-foreground">
                    {meta.label}
                  </span>
                  <span className="text-[10px] font-semibold leading-none text-muted-foreground">
                    {group.projects.length}
                  </span>
                  <span className="min-w-0 flex-1" aria-hidden />
                  <button
                    type="button"
                    aria-label={`New ${meta.label} project`}
                    title={`New ${meta.label} project`}
                    onClick={() => onAddProject?.(group.status)}
                    className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-ds-bg hover:text-foreground"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                {group.projects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    bar={meta.bar}
                    muted={group.status === 'COMPLETED'}
                    onOpen={
                      onOpenProject
                        ? () => onOpenProject(project)
                        : () => undefined
                    }
                  />
                ))}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
