'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Inbox, RotateCw } from 'lucide-react';
import { motion, useDragControls } from 'motion/react';
import type { ProjectCard, ProjectStatus } from '@shipyard/shared';

import { KanbanColumn } from '@/components/projects/kanban-column';
import { ProjectKanbanCard } from '@/components/projects/project-kanban-card';
import { Loader } from '@/components/motion/loader';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';

const STATUS_ORDER: ProjectStatus[] = ['PLANNED', 'ACTIVE', 'COMPLETED'];

const CARD_GAP = 10; // px — matches the column body gap-2.5

/** Group the live list into the three board columns by status. */
function groupByStatus(
  projects: ProjectCard[],
): Record<ProjectStatus, ProjectCard[]> {
  return {
    PLANNED: projects.filter((p) => p.status === 'PLANNED'),
    ACTIVE: projects.filter((p) => p.status === 'ACTIVE'),
    COMPLETED: projects.filter((p) => p.status === 'COMPLETED'),
  };
}

/**
 * Projects Kanban view — mirrors the Kanban board in shipyard.pen: three
 * columns (Planned / Active / Completed), each a status column populated with
 * the live project list grouped by `status`.
 *
 * Drag-and-drop, built on framer-motion:
 *  - Pointer-down on a card lifts it out of its column and mounts a floating
 *    overlay (portaled to the body) that takes over the drag via
 *    `useDragControls`. Because the overlay lives outside the board, the
 *    grabbed card is unclipped, sits above every other UI element, and is
 *    free to move across columns.
 *  - The lifted card is removed from its column, so the remaining cards
 *    reflow with a shared-layout animation to fill the vacated slot.
 *  - While dragging, the hovered column is highlighted (amber ring) and a
 *    drop-slot placeholder shows exactly where the card will land.
 *  - On drop, the pointer x is resolved against the three column bounds. A
 *    different column moves the card there (status changes, persisted via
 *    `onStatusChange`); the same column reorders it to the drop position
 *    (local only — the API has no position field yet).
 *  - Selection only fires on a quick click — a drag never opens the detail
 *    panel.
 *
 * Data: the parent's live `useProjects` query is passed in as `projects` and
 * grouped into columns here; the server is authoritative, so a refetch
 * re-groups the board.
 *
 * Status UI:
 *  - `loading` renders a full-area centered spinner in place of the board
 *    (unlike the list view's skeleton rows).
 *  - `error` renders the ErrorState with a retry action in the same space.
 *  - An empty status still renders its column; the column body shows a
 *    dotted "No projects in this state" placeholder.
 */
export function ProjectKanbanView({
  projects,
  onOpenProject,
  onAddProject,
  onStatusChange,
  loading = false,
  error = false,
  onRetry,
}: {
  projects: ProjectCard[];
  onOpenProject?: (id: string) => void;
  /** + button in a column — create a new project in that column's status. */
  onAddProject?: (status: ProjectStatus) => void;
  /** Persist a card dropped onto another column (status switch). */
  onStatusChange?: (projectId: string, status: ProjectStatus) => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const [columns, setColumns] = useState<Record<ProjectStatus, ProjectCard[]>>(
    () => groupByStatus(projects),
  );

  // Keep the board grouped from the live list query — the server is
  // authoritative. Re-group whenever the fetched projects change (create,
  // persisted drag, refetch) via the React "adjust state when a prop changes"
  // pattern, while local drag reordering still applies on top between syncs.
  const [syncedProjects, setSyncedProjects] = useState(projects);
  if (syncedProjects !== projects) {
    setSyncedProjects(projects);
    setColumns(groupByStatus(projects));
  }

  // Column wrapper elements (viewport-space bounds) — drop-target resolution.
  const columnRefs = useRef<Record<ProjectStatus, HTMLElement | null>>({
    PLANNED: null,
    ACTIVE: null,
    COMPLETED: null,
  });
  const boardRef = useRef<HTMLDivElement>(null);

  // Active drag state — the lifted card shown in the floating layer.
  const dragRef = useRef<{ card: ProjectCard; from: ProjectStatus } | null>(
    null,
  );
  const dragEventRef = useRef<PointerEvent | null>(null);
  const [dragging, setDragging] = useState<{
    card: ProjectCard;
    from: ProjectStatus;
  } | null>(null);
  const [overlayRect, setOverlayRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  // Drop-target feedback: which column is hovered + the insertion slot index.
  const [dropTarget, setDropTarget] = useState<ProjectStatus | null>(null);
  const [dropIndex, setDropIndex] = useState(0);
  // Set once a real drag begins; consumed by the click handler so a drag
  // never triggers selection.
  const movedRef = useRef(false);

  const dragControls = useDragControls();

  const startDrag = (
    event: React.PointerEvent<HTMLElement>,
    card: ProjectCard,
    from: ProjectStatus,
  ) => {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    dragRef.current = { card, from };
    dragEventRef.current = event.nativeEvent;
    setOverlayRect({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    });
    // Lifts the card out of its column (siblings reflow) and mounts the
    // overlay, which starts the framer drag session on mount.
    setDragging({ card, from });
  };

  // Start the drag session once the overlay is mounted, using the original
  // pointer event captured at pointer-down.
  const overlayStartedRef = useRef<{ started: boolean; at?: number }>({
    started: false,
  });
  useEffect(() => {
    if (!dragging) return;
    if (overlayStartedRef.current.started) return;
    const event = dragEventRef.current;
    if (!event) return;
    overlayStartedRef.current.started = true;
    const frame = requestAnimationFrame(() => dragControls.start(event));
    return () => cancelAnimationFrame(frame);
  }, [dragging, dragControls]);

  // Resolve which column + insertion slot a pointer lands on. Returns null
  // when the pointer is not over any column.
  const resolveDrop = (
    x: number,
    y: number,
  ): { status: ProjectStatus; index: number } | null => {
    const drag = dragRef.current;
    if (!drag || !overlayRect) return null;

    let target: ProjectStatus | null = null;
    for (const status of STATUS_ORDER) {
      const el = columnRefs.current[status];
      if (el) {
        const rect = el.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right) {
          target = status;
          break;
        }
      }
    }
    if (!target) return null;

    const sameColumn = target === drag.from;
    const pool = sameColumn
      ? columns[drag.from].filter((c) => c.id !== drag.card.id)
      : columns[target];
    let insertIndex = pool.length;
    const bodyEl =
      columnRefs.current[target]?.querySelector('[data-column-body]');
    if (bodyEl) {
      const bodyRect = bodyEl.getBoundingClientRect();
      const slotHeight = overlayRect.height + CARD_GAP;
      const slot = Math.round((y - bodyRect.top) / slotHeight);
      insertIndex = Math.max(0, Math.min(pool.length, slot));
    }
    return { status: target, index: insertIndex };
  };

  const handleDragEnd = (info: { point: { x: number; y: number } }) => {
    const drag = dragRef.current;
    // Resolve the drop target BEFORE clearing the refs — resolveDrop reads
    // dragRef to know which card/column is being dragged.
    const drop =
      drag && overlayRect ? resolveDrop(info.point.x, info.point.y) : null;

    dragRef.current = null;
    dragEventRef.current = null;
    overlayStartedRef.current = { started: false };
    setDropTarget(null);
    if (!drag || !overlayRect) {
      setDragging(null);
      setOverlayRect(null);
      return;
    }

    const targetStatus = drop?.status ?? drag.from;
    const insertIndex = drop?.index ?? 0;

    setColumns((prev) => {
      const sourceList = prev[drag.from].filter((c) => c.id !== drag.card.id);
      const sameColumn = targetStatus === drag.from;

      if (sameColumn) {
        return {
          ...prev,
          [targetStatus]: [
            ...sourceList.slice(0, insertIndex),
            drag.card,
            ...sourceList.slice(insertIndex),
          ],
        };
      }
      return {
        ...prev,
        [drag.from]: sourceList,
        [targetStatus]: [
          ...prev[targetStatus].slice(0, insertIndex),
          drag.card,
          ...prev[targetStatus].slice(insertIndex),
        ],
      };
    });

    // Cross-column drop = a status switch — persist it so the board stays in
    // sync with the DB (the parent refetch re-groups the board afterwards).
    if (targetStatus !== drag.from)
      onStatusChange?.(drag.card.id, targetStatus);

    setDragging(null);
    setOverlayRect(null);
    // Allow the next quick click to select normally.
    window.setTimeout(() => {
      movedRef.current = false;
    }, 0);
  };

  const renderColumn = (status: ProjectStatus) => {
    const cards = columns[status].filter((c) => c.id !== dragging?.card.id);
    const isDropTarget = dragging !== null && dropTarget === status;
    let insertIndex = dropIndex;
    if (isDropTarget) {
      // Clamp the indicator against the actual list length (the dropped card
      // is excluded while dragging).
      insertIndex = Math.max(0, Math.min(cards.length, dropIndex));
    }

    const slot =
      isDropTarget && overlayRect ? (
        <div
          key={`drop-slot-${status}`}
          className="w-full shrink-0"
          style={{ height: overlayRect.height, minHeight: overlayRect.height }}
        >
          <div className="flex h-full w-full items-center justify-center rounded-xl border-2 border-dashed border-ds-brand bg-ds-brand-soft/40">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[1px] text-ds-brand">
              Drop here
            </span>
          </div>
        </div>
      ) : null;

    const items: (ProjectCard | { slot: true })[] = [...cards];
    if (isDropTarget) items.splice(insertIndex, 0, { slot: true });

    // Empty status — the column still renders; its body shows a dotted
    // placeholder (unless a card is being dropped into it).
    const showEmpty = !isDropTarget && cards.length === 0;

    return (
      <div
        key={status}
        ref={(el) => {
          columnRefs.current[status] = el;
        }}
        className="h-full min-w-0 flex-1"
      >
        <KanbanColumn
          status={status}
          count={cards.length}
          isDropTarget={isDropTarget}
          onAdd={() => onAddProject?.(status)}
        >
          {showEmpty ? (
            <EmptyState
              icon={Inbox}
              title="No projects here"
              description="Drag a card into this column or use the + to add one."
              className="py-8"
            />
          ) : (
            <Fragment>
              {items.map((item, index) =>
                'slot' in item ? (
                  <Fragment key={`drop-slot-${status}-${index}`}>
                    {slot}
                  </Fragment>
                ) : (
                  <CardItem
                    key={item.id}
                    card={item}
                    onPointerDown={(event) => startDrag(event, item, status)}
                    onOpenProject={onOpenProject}
                    movedRef={movedRef}
                  />
                ),
              )}
            </Fragment>
          )}
        </KanbanColumn>
      </div>
    );
  };

  // Loading — full-area centered spinner in place of the board.
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-ds-border bg-ds-surface">
        <Loader size={32} variant="spinner" label="Loading projects" />
      </div>
    );
  }

  // Error — full-area error state with a retry action.
  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-ds-border bg-ds-surface">
        <ErrorState
          title="Couldn't load projects"
          description="We ran into a problem fetching the project board. Try again in a moment."
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

  return (
    <>
      <div
        ref={boardRef}
        className="flex h-full w-full gap-4 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {STATUS_ORDER.map(renderColumn)}
      </div>

      {/* Floating drag layer — portaled above everything so the grabbed card
          is unclipped, on top, and free to move across columns. */}
      {dragging && overlayRect
        ? createPortal(
            <motion.div
              style={{
                position: 'fixed',
                left: overlayRect.x,
                top: overlayRect.y,
                width: overlayRect.width,
                zIndex: 9999,
              }}
              drag
              dragControls={dragControls}
              dragMomentum={false}
              dragElastic={0.12}
              onDragStart={() => {
                movedRef.current = true;
              }}
              onDrag={(_, info) => {
                const drop = resolveDrop(info.point.x, info.point.y);
                setDropTarget(drop?.status ?? null);
                setDropIndex(drop?.index ?? 0);
              }}
              onDragEnd={(_, info) => handleDragEnd(info)}
              className="cursor-grabbing"
            >
              <ProjectKanbanCard
                project={dragging.card}
                description={dragging.card.description}
                onOpen={() => onOpenProject?.(dragging.card.id)}
              />
            </motion.div>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * A single rendered kanban card (extracted to avoid duplicating the project
 * object construction in the list slices above/below the drop slot).
 */
function CardItem({
  card,
  onPointerDown,
  onOpenProject,
  movedRef,
}: {
  card: ProjectCard;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onOpenProject?: (id: string) => void;
  movedRef: React.MutableRefObject<boolean>;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="w-full"
    >
      <ProjectKanbanCard
        project={card}
        description={card.description}
        onPointerDown={onPointerDown}
        onOpen={() => {
          if (movedRef.current) {
            movedRef.current = false;
            return;
          }
          onOpenProject?.(card.id);
        }}
      />
    </motion.div>
  );
}
