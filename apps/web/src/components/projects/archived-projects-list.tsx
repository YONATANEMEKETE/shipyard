'use client';

import { Archive, ArchiveRestore, RotateCw } from 'lucide-react';
import { useState } from 'react';

import type { ProjectCard } from '@shipyard/shared';
import { Loader } from '@/components/motion/loader';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useRestoreProject } from '@/hooks/use-projects';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

/**
 * Archived Projects — mirrors "Archived List Group" (owZDi) in shipyard.pen:
 * a read-only list of archived projects, each row showing an archive icon
 * tile, muted name + meta, and a Restore (Ghost) action. Restore needs no
 * confirmation — clicking it swaps the icon for an inline loader while the
 * row leaves the list (comes back with its status preserved into the active
 * views).
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

  // Loading — centered spinner in place of the list.
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-ds-border bg-ds-surface">
        <Loader size={28} variant="spinner" label="Loading archived projects" />
      </div>
    );
  }

  // Error — retryable error state (matches the other project surfaces).
  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-ds-border bg-ds-surface">
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
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const visible =
    query === ''
      ? projects
      : projects.filter((p) => p.name.toLowerCase().includes(query));

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-hidden rounded-xl border border-ds-border bg-ds-surface p-4">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-muted-foreground">
        Archived projects · read only
      </span>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.length === 0 ? (
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
            className="py-10"
          />
        ) : (
          <div className="flex w-full flex-col gap-2">
            {visible.map((project) => {
              const restoring = restoringId === project.id;
              return (
                <div
                  key={project.id}
                  className="flex h-[60px] w-full items-center gap-3.5 rounded-xl border border-ds-border bg-ds-surface-subtle px-4"
                >
                  {/* Archive icon tile */}
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-ds-border bg-ds-sidebar">
                    <Archive className="size-[18px] text-muted-foreground" />
                  </span>

                  {/* Name + meta */}
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="truncate text-[14px] font-semibold leading-none text-muted-foreground">
                      {project.name}
                    </span>
                    <span className="truncate text-[11px] leading-[1.3] text-muted-foreground">
                      Archived · {project.owner.name} · restore to reopen
                    </span>
                  </div>

                  {/* Restore — no confirmation; inline loader while in flight */}
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={restoring || restoreMutation.isPending}
                    onClick={() => handleRestore(project)}
                    className={cn(
                      'h-8 shrink-0 gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-foreground',
                    )}
                  >
                    {restoring ? (
                      <Loader
                        size={13}
                        variant="spinner"
                        label="Restoring project"
                        className="text-muted-foreground"
                      />
                    ) : (
                      <ArchiveRestore className="size-3.5" />
                    )}
                    Restore
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
