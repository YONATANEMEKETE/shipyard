import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FolderKanban, RotateCw } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import type { ProjectCard } from '@shipyard/shared';

import { ProjectStatusBadge } from '@/components/projects/project-status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Button } from '@/components/ui/button';
import { SPRING_LAYOUT } from '@/lib/ease';
import { cn } from '@/lib/utils';

// Projects per page — matches the design's "Showing 1–12 of …" footer.
const PAGE_SIZE = 12;

/**
 * Projects list table — mirrors "Projects List Card" in shipyard.pen:
 * mono column header (Project / Owner / Status / Start / Target), 48px rows,
 * pagination footer. Consumes ProjectCard exactly as the projects API returns
 * it (same shape the list endpoint sends to the client).
 */

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Skeleton row — mirrors ProjectRow's cell geometry so loading → data swaps without layout shift. */
function ProjectRowSkeleton() {
  return (
    <div
      aria-hidden
      data-testid="project-row-skeleton"
      className="flex h-12 min-w-[640px] items-center gap-3 border-b border-ds-border/70 px-4 last:border-b-0 md:min-w-0"
    >
      {/* Project name */}
      <div className="flex min-w-0 flex-[2] items-center gap-3">
        <span className="h-2.5 w-36 max-w-full animate-pulse rounded bg-ds-border/70" />
      </div>

      {/* Owner cell */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="size-6 shrink-0 animate-pulse rounded-full bg-ds-border/70" />
        <span className="h-2 w-24 max-w-full animate-pulse rounded bg-ds-border/40" />
      </div>

      {/* Status */}
      <div className="flex w-[92px] shrink-0 items-center justify-start">
        <span className="h-5 w-[72px] animate-pulse rounded-full bg-ds-border/70" />
      </div>

      {/* Start */}
      <div className="ml-4 w-24 shrink-0">
        <span className="block h-2.5 w-16 animate-pulse rounded bg-ds-border/40" />
      </div>

      {/* Target */}
      <div className="w-24 shrink-0">
        <span className="block h-2.5 w-16 animate-pulse rounded bg-ds-border/40" />
      </div>

      {/* Row action spacer */}
      <span className="size-[26px] shrink-0" />
    </div>
  );
}

function ProjectRow({
  project,
  onOpen,
}: {
  project: ProjectCard;
  onOpen: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
      className="flex h-12 min-w-[640px] cursor-pointer items-center gap-3 border-b border-ds-border/70 px-4 transition-colors hover:bg-ds-bg last:border-b-0 md:min-w-0"
    >
      {/* Project name */}
      <div className="flex min-w-0 flex-[2] items-center">
        <span className="truncate text-[12.5px] font-semibold leading-none text-foreground">
          {project.name}
        </span>
      </div>

      {/* Owner — avatar + name */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {project.owner.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.owner.image}
            alt=""
            className="size-6 shrink-0 rounded-full border border-ds-border/60 object-cover"
          />
        ) : (
          <span className="grid size-6 shrink-0 place-items-center rounded-full border border-ds-border bg-ds-surface-subtle font-mono text-[8.5px] font-bold text-muted-foreground">
            {initialsOf(project.owner.name)}
          </span>
        )}
        <span className="truncate text-[12px] leading-none text-muted-foreground">
          {project.owner.name}
        </span>
      </div>

      {/* Status */}
      <span className="flex w-[92px] shrink-0 items-center justify-start">
        <ProjectStatusBadge status={project.status} />
      </span>

      {/* Start */}
      <span className="ml-4 w-24 shrink-0 text-[11px] text-muted-foreground">
        {formatDate(project.startDate)}
      </span>

      {/* Target */}
      <span className="w-24 shrink-0 text-[11px] text-muted-foreground">
        {formatDate(project.targetDate)}
      </span>

      {/* Row action */}
      <button
        type="button"
        aria-label={`Open ${project.name}`}
        onClick={onOpen}
        className="grid size-[26px] shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-ds-bg hover:text-foreground"
      >
        <motion.span
          initial={false}
          animate={{ x: hovered ? 3 : 0 }}
          transition={SPRING_LAYOUT}
          className="inline-grid"
        >
          <ChevronRight className="size-[13px]" />
        </motion.span>
      </button>
    </div>
  );
}

export function ProjectsTable({
  projects,
  loading = false,
  error = false,
  onRetry,
  onOpenProject,
  emptyTitle,
  emptyDescription,
}: {
  projects: ProjectCard[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** Open a project — row and chevron both trigger it. */
  onOpenProject?: (project: ProjectCard) => void;
  /** Customize the empty state copy — e.g. "no matches" when filters are active. */
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const showEmpty = !loading && !error && projects.length === 0;
  const centered = (showEmpty || error) && !loading;

  // Client-side pagination — the list endpoint pages server-side once wired;
  // for now the mock data is sliced locally so the footer is exercised.
  const totalPages = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const [page, setPage] = useState(1);
  const safePage = Math.min(page, totalPages);
  const pageProjects = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return projects.slice(start, start + PAGE_SIZE);
  }, [projects, safePage]);
  const from = projects.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, projects.length);
  // Compact page list: always 1 and last, current ±1, ellipsis in between.
  const pageButtons = useMemo(() => {
    const set = new Set<number>([
      1,
      totalPages,
      safePage - 1,
      safePage,
      safePage + 1,
    ]);
    return [...set]
      .filter((p) => p >= 1 && p <= totalPages)
      .sort((a, b) => a - b);
  }, [safePage, totalPages]);

  return (
    <div className="flex h-full w-full flex-col overflow-x-auto rounded-xl border border-ds-border bg-ds-surface">
      {/* Mono column header */}
      <div className="flex h-9 min-w-[640px] shrink-0 items-center gap-3 border-b border-ds-border bg-ds-bg px-4 md:min-w-0">
        <span className="flex-[2] font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
          Project
        </span>
        <span className="flex-1 font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
          Owner
        </span>
        <span className="w-[92px] text-left font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
          Status
        </span>
        <span className="ml-4 w-24 font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
          Start
        </span>
        <span className="w-24 font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
          Target
        </span>
        <span className="w-[26px]" />
      </div>

      {/* Rows */}
      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          centered && 'flex flex-col items-center justify-center',
        )}
      >
        {loading ? (
          Array.from({ length: 12 }, (_, index) => (
            <ProjectRowSkeleton key={index} />
          ))
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
            title={emptyTitle ?? 'No projects yet'}
            description={
              emptyDescription ??
              'Create your first project to start tracking initiatives.'
            }
          />
        ) : (
          pageProjects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              onOpen={
                onOpenProject ? () => onOpenProject(project) : () => undefined
              }
            />
          ))
        )}
        {/* Bottom fade — lets the last rows dissolve into the surface before the footer */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-ds-surface to-transparent"
        />
      </div>

      {/* Pagination footer — pages the mock list locally */}
      <div className="flex h-[52px] min-w-[640px] shrink-0 items-center justify-between gap-4 px-4 md:min-w-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous page"
            disabled={safePage === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="grid size-7 place-items-center rounded-md border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="size-[14px]" />
          </button>

          {pageButtons.map((p, index) => {
            const prev = pageButtons[index - 1];
            const showEllipsis = prev !== undefined && p - prev > 1;
            return (
              <span key={p} className="flex items-center gap-1.5">
                {showEllipsis ? (
                  <span className="px-0.5 text-xs text-muted-foreground">
                    …
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={`Page ${p}`}
                  aria-current={p === safePage ? 'page' : undefined}
                  onClick={() => setPage(p)}
                  className={cn(
                    'grid size-7 place-items-center rounded-md text-xs font-semibold transition-colors',
                    p === safePage
                      ? 'bg-ds-brand text-white'
                      : 'border border-ds-border bg-ds-bg text-muted-foreground hover:text-foreground',
                  )}
                >
                  {p}
                </button>
              </span>
            );
          })}

          <button
            type="button"
            aria-label="Next page"
            disabled={safePage === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="grid size-7 place-items-center rounded-md border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="size-[14px]" />
          </button>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {projects.length === 0
            ? 'No projects'
            : `Showing ${from}–${to} of ${projects.length} ${
                projects.length === 1 ? 'project' : 'projects'
              }`}
        </span>
      </div>
    </div>
  );
}
