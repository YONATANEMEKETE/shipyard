import { useMemo } from 'react';
import type { ProjectCard } from '@shipyard/shared';

import { ProjectsTable } from '@/components/projects/projects-table';
import { mockProjects } from '@/components/projects/mock-projects';
import type { ProjectFilters } from '@/components/projects/projects-toolbar';

/**
 * Projects List view — renders the ProjectsTable with mock data (until the
 * live list query is wired in). Applies the toolbar's client-side filters
 * (search + status + owner) so the UI responds to the controls, mirroring
 * MemberDirectory. `loading` drives the row skeletons, `error` renders the
 * ErrorState, an empty result renders the EmptyState — the table resolves its
 * own states, matching the members table. Sorting/pagination remain UI-only.
 */
export function ProjectListView({
  filters,
  loading = false,
  error = false,
  onRetry,
}: {
  filters: ProjectFilters;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const visibleProjects = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return mockProjects.filter((project: ProjectCard) => {
      const matchesSearch =
        query === '' || project.name.toLowerCase().includes(query);
      const matchesStatus =
        filters.status === undefined || project.status === filters.status;
      const matchesOwner =
        filters.ownerId === undefined ||
        project.owner.memberId === filters.ownerId;
      return matchesSearch && matchesStatus && matchesOwner;
    });
  }, [filters.search, filters.status, filters.ownerId]);

  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.status !== undefined ||
    filters.ownerId !== undefined;

  return (
    <ProjectsTable
      projects={visibleProjects}
      loading={loading}
      error={error}
      onRetry={onRetry}
      emptyTitle={hasActiveFilters ? 'No projects match' : undefined}
      emptyDescription={
        hasActiveFilters
          ? 'Try a different name, status or owner — or clear the filters.'
          : undefined
      }
    />
  );
}
