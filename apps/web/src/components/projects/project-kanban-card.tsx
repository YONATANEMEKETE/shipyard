'use client';

import { Calendar } from 'lucide-react';
import type { ProjectCard } from '@shipyard/shared';

import { cn } from '@/lib/utils';

/**
 * Kanban project card — mirrors "Card / Project (Kanban)" (lDauH) in
 * shipyard.pen: a white 260px card with title, 2-line clamped description,
 * and a footer of member avatar stack + target date. Clicking selects the
 * project (drives the detail panel via the parent).
 */

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

const AVATAR_COLORS = [
  'bg-ds-brand',
  'bg-ds-info',
  'bg-ds-success',
  'bg-ds-warning',
  'bg-ds-danger',
  'bg-ds-text',
];

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
  members,
  description,
  onOpen,
}: {
  project: ProjectCard;
  /** Assigned member names — displayed as an overlapping avatar stack. */
  members: string[];
  /** Optional description (list card omits it; kanban shows it). */
  description?: string | null;
  onOpen: () => void;
}) {
  const visible = members.slice(0, 3);
  const overflow = members.length - visible.length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-2.5 rounded-xl border border-ds-border bg-ds-surface p-3 text-left shadow-[0_2px_8px_#17171714] transition-colors hover:border-ds-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Title */}
      <span className="text-[13.5px] font-semibold leading-snug text-foreground">
        {project.name}
      </span>

      {/* Description — clamped to two lines */}
      <span className="line-clamp-2 text-[11px] leading-[1.5] text-muted-foreground">
        {description ?? 'No description yet.'}
      </span>

      {/* Footer — avatar stack + target date */}
      <div className="mt-0.5 flex w-full items-center justify-between gap-1.5">
        <span className="relative flex h-[18px] items-center">
          {visible.map((name, index) => (
            <span
              key={`${name}-${index}`}
              className={cn(
                'grid size-[18px] shrink-0 place-items-center rounded-full font-mono text-[7px] font-bold text-white ring-2 ring-ds-surface',
                AVATAR_COLORS[index % AVATAR_COLORS.length],
                index > 0 && '-ml-2',
              )}
              style={{ zIndex: index + 1 }}
            >
              {initialsOf(name)}
            </span>
          ))}
          {overflow > 0 ? (
            <span
              className="grid size-[18px] shrink-0 place-items-center rounded-full bg-ds-brand font-mono text-[7px] font-bold text-white ring-2 ring-ds-surface -ml-2"
              style={{ zIndex: visible.length + 1 }}
            >
              +{overflow}
            </span>
          ) : null}
        </span>

        <span className="flex shrink-0 items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <Calendar className="size-3" />
          {formatDate(project.targetDate)}
        </span>
      </div>
    </button>
  );
}
