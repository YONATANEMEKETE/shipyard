'use client';

import { Calendar } from 'lucide-react';
import type { ProjectCard, ProjectWorkerCard } from '@shipyard/shared';

import { displayProgress } from '@/components/projects/project-progress';
import { cn } from '@/lib/utils';

/**
 * Kanban project card — mirrors "Card / Project (Kanban)" (lDauH) in
 * shipyard.pen: owner row (avatar + short name), title, 2-line clamped
 * description, progress bar + "N of M issues done" meta, divider, and a
 * footer of worker avatar stack + target date. Clicking selects the project
 * (drives the detail panel via the parent).
 */

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

/** "Yonatane Mekete" → "Yonatane M." per the design's owner row. */
function shortName(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length <= 1) return name;
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function Avatar({
  userId,
  name,
  image,
}: {
  userId: string;
  name: string;
  image: string | null;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        className="size-[18px] shrink-0 rounded-full object-cover ring-2 ring-ds-surface"
      />
    );
  }
  return (
    <span
      className={cn(
        'grid size-[18px] shrink-0 place-items-center rounded-full font-mono text-[7px] font-bold text-white ring-2 ring-ds-surface',
        toneFor(userId),
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Overlapping worker stack — first three, then a +N overflow circle. */
function WorkerStack({ workers }: { workers: ProjectWorkerCard[] }) {
  if (workers.length === 0) {
    return (
      <span className="text-[11px] leading-none text-muted-foreground">
        No one assigned yet
      </span>
    );
  }
  const shown = workers.slice(0, 3);
  const overflow = workers.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((worker, index) => (
        <span
          key={worker.userId}
          className={cn(index > 0 && '-ml-1.5')}
          title={worker.name}
        >
          <Avatar
            userId={worker.userId}
            name={worker.name}
            image={worker.image}
          />
        </span>
      ))}
      {overflow > 0 ? (
        <span className="-ml-1.5 grid size-[18px] shrink-0 place-items-center rounded-full bg-ds-surface-subtle font-mono text-[7px] font-bold text-muted-foreground ring-2 ring-ds-surface">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
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
  const pct = displayProgress(project);
  const total = project.progress.total;
  const completed = project.progress.completed;

  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={onPointerDown}
      className="flex w-full cursor-grab flex-col gap-2.5 rounded-xl border border-ds-border bg-ds-surface p-3 text-left shadow-[0_2px_8px_#17171714] transition-colors active:cursor-grabbing hover:border-ds-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Owner row */}
      <span className="flex w-full items-center gap-1.5">
        {project.owner.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.owner.image}
            alt=""
            className="size-[18px] shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-ds-brand font-mono text-[7px] font-bold text-white">
            {initialsOf(project.owner.name)}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-none text-muted-foreground">
          {shortName(project.owner.name)}
        </span>
      </span>

      {/* Title */}
      <span className="text-[14px] font-semibold leading-snug text-foreground">
        {project.name}
      </span>

      {/* Description — clamped to two lines */}
      <span className="line-clamp-2 text-[11px] leading-[1.5] text-muted-foreground">
        {description ?? 'No description yet.'}
      </span>

      {/* Progress */}
      <span className="flex w-full flex-col gap-1.5">
        <span className="flex w-full items-center gap-2">
          <span
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${project.name} progress`}
            className="h-1.5 min-w-0 flex-1 rounded-full bg-ds-border"
          >
            <span
              aria-hidden
              className="block h-full rounded-full bg-ds-brand"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="shrink-0 text-[11px] font-semibold leading-none text-foreground">
            {pct}%
          </span>
        </span>
        <span className="text-[11px] leading-none text-muted-foreground">
          {total === 0
            ? 'No issues yet'
            : `${completed} of ${total} issues done`}
        </span>
      </span>

      <span className="h-px w-full bg-ds-border" aria-hidden />

      {/* Footer — worker stack + target date */}
      <span className="flex w-full items-center justify-between gap-1.5">
        <WorkerStack workers={project.workers} />
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <Calendar className="size-3" />
          {formatDate(project.targetDate)}
        </span>
      </span>
    </button>
  );
}
