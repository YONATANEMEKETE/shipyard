'use client';

import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ProjectStatus } from '@shipyard/shared';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Kanban column — mirrors "Kanban Column" (LRZOW) in shipyard.pen: a 300px
 * grey surface column with a header (status dot, label, count, add button)
 * and a vertical body of project cards. The header dot color follows the
 * status (Active amber, Completed green, Planned neutral).
 */

const DOT_COLOR: Record<ProjectStatus, string> = {
  ACTIVE: 'bg-ds-brand',
  COMPLETED: 'bg-ds-success',
  PLANNED: 'bg-ds-text-muted',
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  PLANNED: 'Planned',
};

export function KanbanColumn({
  status,
  count,
  onAdd,
  isDropTarget = false,
  children,
}: {
  status: ProjectStatus;
  count: number;
  onAdd?: () => void;
  /** Highlight the column while a card is dragged over it. */
  isDropTarget?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      data-column-status={status}
      className={cn(
        'flex h-full min-w-[280px] flex-1 flex-col gap-3 rounded-xl border bg-ds-sidebar p-3 transition-colors',
        isDropTarget ? 'border-ds-brand border-[1.5px]' : 'border-ds-border',
      )}
    >
      {/* Column header */}
      <div className="flex w-full items-center gap-2">
        <span
          aria-hidden
          className={cn('size-2 shrink-0 rounded-full', DOT_COLOR[status])}
        />
        <span className="text-[13px] font-semibold text-foreground">
          {STATUS_LABEL[status]}
        </span>
        <span className="font-mono text-[11px] font-semibold text-muted-foreground">
          {count}
        </span>
        <span className="flex-1" />
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Add to ${STATUS_LABEL[status]}`}
                onClick={onAdd}
                className="grid size-6 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-ds-surface hover:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Add to {STATUS_LABEL[status]}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Column body — owns the vertical scroll so only this column scrolls */}
      <div
        data-column-body
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </section>
  );
}
