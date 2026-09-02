import { useMemo } from 'react';
import type { ProjectCard } from '@shipyard/shared';

import { ProjectsTable } from '@/components/projects/projects-table';
import type { ProjectFilters } from '@/components/projects/projects-toolbar';

/**
 * Projects List view — renders the ProjectsTable with the projects fetched by
 * the parent page query. The parent owns the server-side filter params
 * (status/owner/dates/sort); here we apply the client-side text search (the
 * list endpoint has no search param) so the toolbar responds live. `loading`
 * drives the row skeletons, `error` renders the ErrorState, an empty result
 * renders the EmptyState — the table resolves its own states, matching the
 * members table.
 */
export function ProjectListView({
  projects,
  filters,
  loading = false,
  error = false,
  onRetry,
}: {
  projects: ProjectCard[];
  filters: ProjectFilters;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const visibleProjects = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    if (query === '') return projects;
    return projects.filter((project: ProjectCard) =>
      project.name.toLowerCase().includes(query),
    );
  }, [projects, filters.search]);

  const hasActiveFilters = filters.search.trim() !== '';

  return (
    <ProjectsTable
      projects={visibleProjects}
      loading={loading}
      error={error}
      onRetry={onRetry}
      emptyTitle={hasActiveFilters ? 'No projects match' : undefined}
      emptyDescription={
        hasActiveFilters
          ? 'Try a different name — or clear the search.'
          : undefined
      }
    />
  );
}
