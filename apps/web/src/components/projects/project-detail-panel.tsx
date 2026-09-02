'use client';

import {
  Archive,
  FolderKanban,
  Pencil,
  RotateCw,
  Trash2,
  UserRoundPlus,
} from 'lucide-react';
import { useState } from 'react';
import type { ProjectDetail } from '@shipyard/shared';

import { Loader } from '@/components/motion/loader';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { EditProjectDialog } from '@/components/projects/edit-project-dialog';
import { TransferProjectDialog } from '@/components/projects/transfer-project-dialog';
import { ArchiveProjectDialog } from '@/components/projects/archive-project-dialog';
import { useSession } from '@/hooks/use-session';
import { useWorkspace } from '@/hooks/use-workspaces';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Project Details Panel — mirrors "Project Details Panel" (Ifql7) in
 * shipyard.pen: a 360px white card that is always present regardless of the
 * active view (List or Kanban). Three states:
 *  - No selection → empty prompt ("Select a project to see its details").
 *  - Selected + loading → a centered loader.
 *  - Selected + loaded → the full detail: owner (avatar image, falling back to
 *    initials), status, name, description, start/target dates, and a demo
 *    progress bar (45% until the issues feature drives real progress).
 * The parent splits the content area 70/30 (list ↔ panel).
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}

export function ProjectDetailPanel({
  slug,
  project,
  loading = false,
  error = false,
  onRetry,
  onArchived,
}: {
  slug: string;
  project: ProjectDetail | null;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** Fired after a successful archive so the parent clears the selection. */
  onArchived?: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Transfer visibility: workspace OWNERs can change ownership of any project;
  // ADMINs only of projects they own. MEMBERs never see the button (and must
  // not, even when they own a project).
  const { data: session } = useSession();
  const { data: workspace } = useWorkspace(slug);
  const canTransfer =
    workspace?.role === 'OWNER' ||
    (workspace?.role === 'ADMIN' && project?.owner.userId === session?.user.id);
  // Members are read-only on a project — every write action is disabled.
  const canEdit = workspace?.role === 'OWNER' || workspace?.role === 'ADMIN';
  // Loading — centered loader inside the card.
  if (loading) {
    return (
      <aside className="flex h-full w-full items-center justify-center rounded-xl border border-ds-border bg-ds-surface">
        <Loader size={28} variant="spinner" label="Loading project details" />
      </aside>
    );
  }

  // Error — centered error state with a retry action (matches the tables).
  if (error) {
    return (
      <aside className="flex h-full w-full items-center justify-center rounded-xl border border-ds-border bg-ds-surface">
        <ErrorState
          title="Couldn't load project details"
          description="We ran into a problem fetching this project. Try again in a moment."
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
      </aside>
    );
  }

  // No selection — empty prompt.
  if (!project) {
    return (
      <aside className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-ds-border bg-ds-surface p-6 text-center">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-ds-border bg-ds-bg">
          <FolderKanban aria-hidden className="size-5 text-muted-foreground" />
        </span>
        <p className="text-[13px] font-semibold text-foreground">
          No project selected
        </p>
        <p className="max-w-[240px] text-xs leading-[1.5] text-muted-foreground">
          Select a project from the list to see its details here.
        </p>
      </aside>
    );
  }

  const statusColor: Record<ProjectDetail['status'], string> = {
    ACTIVE: 'bg-ds-brand-soft text-ds-brand',
    COMPLETED: 'bg-ds-success-soft text-ds-success',
    PLANNED: 'bg-ds-surface-subtle text-muted-foreground',
  };

  return (
    <aside className="flex h-full w-full flex-col gap-4 overflow-hidden rounded-xl border border-ds-border bg-ds-surface p-5">
      {/* Header — title */}
      <div className="flex w-full items-center gap-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate text-[18px] font-bold leading-none tracking-[-0.4px] text-foreground">
            {project.name}
          </h2>
          <p className="truncate text-xs leading-none text-muted-foreground">
            Project
          </p>
        </div>
      </div>

      {/* Status pill */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-[22px] w-fit items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium',
            statusColor[project.status],
          )}
        >
          <span
            aria-hidden
            className={cn(
              'size-1.5 rounded-full',
              project.status === 'ACTIVE'
                ? 'bg-ds-brand'
                : project.status === 'COMPLETED'
                  ? 'bg-ds-success'
                  : 'bg-ds-text-muted',
            )}
          />
          {project.status.charAt(0) + project.status.slice(1).toLowerCase()}
        </span>
      </div>

      {/* Owner */}
      <div className="flex w-full items-center gap-2.5">
        {project.owner.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.owner.image}
            alt=""
            className="size-8 shrink-0 rounded-full border border-ds-border/60 object-cover"
          />
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ds-brand font-mono text-[10px] font-bold text-white">
            {initialsOf(project.owner.name)}
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold leading-none text-foreground">
            {project.owner.name}
          </span>
          <span className="text-[11px] leading-none text-muted-foreground">
            Project owner
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-[12.5px] leading-[1.55] text-foreground">
        {project.description ?? 'No description yet.'}
      </p>

      <div className="h-px w-full bg-ds-border" />

      {/* Details */}
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[1px] text-muted-foreground">
        Details
      </span>
      <DetailRow label="Status" value={project.status} />
      <DetailRow label="Start date" value={formatDate(project.startDate)} />
      <DetailRow label="Target date" value={formatDate(project.targetDate)} />

      <div className="h-px w-full bg-ds-border" />

      {/* Progress — demo 45% until the issues feature drives real progress */}
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[1px] text-muted-foreground">
        Progress
      </span>
      <div className="flex w-full items-center gap-2.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ds-border">
          <div
            className="h-full rounded-full bg-ds-brand"
            style={{ width: '45%' }}
          />
        </div>
        <span className="shrink-0 font-mono text-[11px] font-semibold text-foreground">
          45%
        </span>
      </div>

      {/* Spacer pushes actions to the bottom */}
      <div className="flex-1" />

      <div className="h-px w-full bg-ds-border" />

      {/* Actions */}
      <div className="flex w-full items-center gap-2">
        <Button
          type="button"
          onClick={() => setEditOpen(true)}
          disabled={!canEdit}
          className="h-9 flex-1 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90 disabled:bg-ds-surface-subtle disabled:text-muted-foreground disabled:hover:bg-ds-surface-subtle"
        >
          <Pencil className="size-3.5" />
          Edit
        </Button>
        <TooltipProvider delayDuration={100}>
          {canTransfer ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  aria-label="Transfer ownership"
                  variant="outline"
                  size="icon"
                  onClick={() => setTransferOpen(true)}
                  className="size-9 rounded-md border-ds-border bg-ds-surface text-muted-foreground"
                >
                  <UserRoundPlus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Transfer ownership</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                aria-label="Archive project"
                variant="outline"
                size="icon"
                disabled={!canEdit}
                onClick={() => setArchiveOpen(true)}
                className="size-9 rounded-md border-ds-border bg-ds-surface text-muted-foreground"
              >
                <Archive className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Archive project</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                aria-label="Delete project"
                variant="outline"
                size="icon"
                disabled={!canEdit}
                className="size-9 rounded-md border-ds-border bg-ds-surface text-ds-danger"
              >
                <Trash2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Delete project</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Edit project — the selected project drives the form's initial state. */}
      <EditProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        slug={slug}
        project={project}
      />

      {/* Change ownership — transfers the selected project to a workspace member. */}
      <TransferProjectDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        slug={slug}
        project={project}
      />

      {/* Archive — confirm; on success the parent clears the selection and the
          project leaves boards/lists. */}
      <ArchiveProjectDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        slug={slug}
        project={project}
        onArchived={onArchived}
      />
    </aside>
  );
}
