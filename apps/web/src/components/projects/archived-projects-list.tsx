'use client';

import { Archive, CornerDownRight, RotateCw } from 'lucide-react';
import { useState } from 'react';

import type { ProjectCard, ProjectStatus } from '@shipyard/shared';
import { Loader } from '@/components/motion/loader';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useRestoreProject } from '@/hooks/use-projects';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

const STORED_STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNED: 'was Planned',
  ACTIVE: 'was Active',
  COMPLETED: 'was Completed',
};

/**
 * Archived Projects — mirrors "Projects Grouped List" on
 * Screen / Projects - Archived in shipyard.pen: a bare single-group list
 * (no card container) with an Archived header (count), and 48px rows of
 * go-arrow + muted name + ARCHIVED badge + stored status + brand Restore
 * action. Restore needs no confirmation — clicking it swaps the label for
 * an inline loader while the row leaves the list (comes back with its
 * status preserved into the active views).
 */
export function ArchivedProjectsList({
  slug,
  projects,
  search = '',
  loading = false,
  error = false,
  onRetry,
}: {
  slug: string;
  projects: ProjectCard[];
  /** Toolbar search — filters by name, live. */
  search?: string;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const { showToast } = useToast();
  const restoreMutation = useRestoreProject(slug, {
    onError: (err) => {
      showToast({
        status: 'error',
        title: "Couldn't restore project",
        description: err.message || 'Please try again.',
      });
    },
  });

  // Which row's restore is in flight — shows the inline loader on that button.
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const handleRestore = (project: ProjectCard) => {
    setRestoringId(project.id);
    restoreMutation.mutate(
      { projectId: project.id },
      {
        onSettled: () => setRestoringId(null),
        onSuccess: (restored) => {
          showToast({
            status: 'success',
            title: 'Project restored',
            description: `${restored.name} is back in boards and lists.`,
          });
        },
      },
    );
  };

  const query = search.trim().toLowerCase();
  const visible =
    query === ''
      ? projects
      : projects.filter((p) => p.name.toLowerCase().includes(query));

  const showEmpty = !loading && !error && visible.length === 0;
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
          <Loader
            size={28}
            variant="spinner"
            label="Loading archived projects"
          />
        ) : error ? (
          <ErrorState
            title="Couldn't load archived projects"
            description="We ran into a problem fetching the archive. Try again in a moment."
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
            icon={Archive}
            title={
              query ? 'No archived projects match' : 'No archived projects'
            }
            description={
              query
                ? 'Try a different name — or clear the search.'
                : 'Archive a project and it lands here, ready to restore.'
            }
          />
        ) : (
          <section aria-label="Archived">
            <div className="flex h-9 items-center gap-2 border-b border-ds-border bg-ds-surface-subtle px-4">
              <Archive
                aria-hidden
                className="size-[15px] shrink-0 text-muted-foreground"
              />
              <span className="text-[12.5px] font-semibold leading-none text-foreground">
                Archived
              </span>
              <span className="text-[10px] font-semibold leading-none text-muted-foreground">
                {visible.length}
              </span>
            </div>
            {visible.map((project) => {
              const restoring = restoringId === project.id;
              return (
                <div
                  key={project.id}
                  className="flex h-12 min-w-[560px] items-center gap-3 border-b border-ds-border/70 px-4 transition-colors last:border-b-0 hover:bg-ds-bg md:min-w-0"
                >
                  <CornerDownRight
                    aria-hidden
                    className="size-[15px] shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] leading-none text-muted-foreground">
                    {project.name}
                  </span>
                  <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-[#F0EFEB] px-2 font-mono text-[9px] font-semibold leading-none text-muted-foreground">
                    ARCHIVED
                  </span>
                  <span className="w-24 shrink-0 text-[11.5px] leading-none text-muted-foreground">
                    {STORED_STATUS_LABEL[project.status]}
                  </span>
                  <button
                    type="button"
                    disabled={restoring || restoreMutation.isPending}
                    onClick={() => handleRestore(project)}
                    className="shrink-0 text-xs font-semibold text-ds-brand transition-colors hover:text-ds-brand/80 disabled:pointer-events-none disabled:opacity-60"
                  >
                    {restoring ? (
                      <Loader
                        size={13}
                        variant="spinner"
                        label="Restoring project"
                      />
                    ) : (
                      'Restore'
                    )}
                  </button>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
