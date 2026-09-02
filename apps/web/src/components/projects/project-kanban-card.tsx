'use client';

import { Calendar } from 'lucide-react';
import type { ProjectCard } from '@shipyard/shared';

/**
 * Kanban project card — mirrors "Card / Project (Kanban)" (lDauH) in
 * shipyard.pen: a white 260px card with title, 2-line clamped description,
 * and a footer of owner avatar + target date. Clicking selects the project
 * (drives the detail panel via the parent).
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

export function ProjectKanbanCard({
  project,
  description,
  onOpen,
  onPointerDown,
}: {
  project: ProjectCard;
  /** Optional description (list card omits it; kanban shows it). */
  description?: string | null;
  onOpen: () => void;
  onPointerDown?: (event: React.PointerEvent<HTMLElement>) => void;
}) {
  // Avatar — the owner's image when available, initials otherwise.
  const ownerAvatar = project.owner.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={project.owner.image}
      alt=""
      className="size-[18px] shrink-0 rounded-full object-cover ring-2 ring-ds-surface"
    />
  ) : (
    <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-ds-brand font-mono text-[7px] font-bold text-white ring-2 ring-ds-surface">
      {initialsOf(project.owner.name)}
    </span>
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={onPointerDown}
      className="flex w-full cursor-grab flex-col gap-2.5 rounded-xl border border-ds-border bg-ds-surface p-3 text-left shadow-[0_2px_8px_#17171714] transition-colors active:cursor-grabbing hover:border-ds-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Title */}
      <span className="text-[13.5px] font-semibold leading-snug text-foreground">
        {project.name}
      </span>

      {/* Description — clamped to two lines */}
      <span className="line-clamp-2 text-[11px] leading-[1.5] text-muted-foreground">
        {description ?? 'No description yet.'}
      </span>

      {/* Footer — owner avatar + target date */}
      <div className="mt-0.5 flex w-full items-center justify-between gap-1.5">
        <span className="relative flex h-[18px] items-center">
          {ownerAvatar}
        </span>

        <span className="flex shrink-0 items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <Calendar className="size-3" />
          {formatDate(project.targetDate)}
        </span>
      </div>
    </button>
  );
}
