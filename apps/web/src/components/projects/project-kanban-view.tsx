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

// Pointer movement required (px) before a card lifts into the drag overlay.
// Below this a pointer-down is a click: the card stays put and selection works.
const DRAG_THRESHOLD = 5;

/** Group the live list into the three board columns by status. The toolbar's
 *  text search is applied client-side first (matches the list view), so both
 *  views stay live as the user types. */
function groupByStatus(
  projects: ProjectCard[],
  search = '',
): Record<ProjectStatus, ProjectCard[]> {
  const q = search.trim().toLowerCase();
  const visible =
    q === ''
      ? projects
      : projects.filter((p) => p.name.toLowerCase().includes(q));
  return {
    PLANNED: visible.filter((p) => p.status === 'PLANNED'),
    ACTIVE: visible.filter((p) => p.status === 'ACTIVE'),
    COMPLETED: visible.filter((p) => p.status === 'COMPLETED'),
  };
}

/**
 * Projects Kanban view — mirrors the Kanban board in shipyard.pen: three
 * columns (Planned / Active / Completed), each a status column populated with
 * the live project list grouped by `status`.
 *
 * Drag-and-drop, built on framer-motion:
 *  - Pointer-down on a card arms a pending drag; only once the pointer moves
 *    past a small threshold (DRAG_THRESHOLD px) is the card lifted into a
 *    floating overlay (portaled to the body) that takes over via
 *    `useDragControls`. A plain click never lifts the card, so selection is
 *    reliable on the first try. Because the overlay lives outside the board,
 *    the grabbed card is unclipped, sits above every other UI element, and is
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
  search = '',
  onOpenProject,
  onAddProject,
  onStatusChange,
  loading = false,
  error = false,
  onRetry,
}: {
  projects: ProjectCard[];
  /** Toolbar text search — filters cards by name across all columns. */
  search?: string;
  onOpenProject?: (id: string) => void;
  /** + button in a column — create a new project in that column's status. */
  onAddProject?: (status: ProjectStatus) => void;
  /** Persist a card dropped onto another column (status switch). A rejected
   *  promise means it failed — the board reverts the optimistic move. */
  onStatusChange?: (
    projectId: string,
    status: ProjectStatus,
  ) => Promise<unknown> | void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const [columns, setColumns] = useState<Record<ProjectStatus, ProjectCard[]>>(
    () => groupByStatus(projects, search),
  );

  // Keep the board grouped from the live list query — the server is
  // authoritative. Re-group whenever the fetched projects OR the search term
  // change (create, persisted drag, refetch) via the React "adjust state when
  // a prop changes" pattern, while local drag reordering still applies on top
  // between syncs.
  const [syncedProjects, setSyncedProjects] = useState(projects);
  const [syncedSearch, setSyncedSearch] = useState(search);
  if (syncedProjects !== projects || syncedSearch !== search) {
    setSyncedProjects(projects);
    setSyncedSearch(search);
    setColumns(groupByStatus(projects, search));
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

  // Pending pointer session — armed on pointer-down. Commits to a real drag
  // only after the pointer moves past DRAG_THRESHOLD px, so a click never
  // lifts/unmounts its card (the browser click always lands on it → selection
  // works on the first try).
  const pendingDragRef = useRef<{
    card: ProjectCard;
    from: ProjectStatus;
    pointerId: number;
    startX: number;
    startY: number;
    rect: DOMRect;
  } | null>(null);
  // True once the framer drag session is bound to the overlay.
  const sessionStartedRef = useRef(false);
  // pointerup/cancel fallback registered when a drag commits — held in a ref
  // so it can be removed from a later render without an identity mismatch.
  const dragFallbackRef = useRef<(() => void) | null>(null);

  const removeDragFallback = () => {
    const fallback = dragFallbackRef.current;
    if (fallback) {
      window.removeEventListener('pointerup', fallback);
      window.removeEventListener('pointercancel', fallback);
      dragFallbackRef.current = null;
    }
  };

  // Force-resolve an active drag/overlay state. Used when the pointer is
  // released before framer's session could bind (e.g. a very fast flick) so
  // no overlay is left stuck over the board.
  const settleDrag = () => {
    removeDragFallback();
    sessionStartedRef.current = false;
    pendingDragRef.current = null;
    dragRef.current = null;
    dragEventRef.current = null;
    setDropTarget(null);
    setDragging(null);
    setOverlayRect(null);
    // Allow the next quick click to select normally (matches handleDragEnd).
    window.setTimeout(() => {
      movedRef.current = false;
    }, 0);
  };

  const beginDrag = (
    event: React.PointerEvent<HTMLElement>,
    card: ProjectCard,
    from: ProjectStatus,
  ) => {
    pendingDragRef.current = {
      card,
      from,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect: event.currentTarget.getBoundingClientRect(),
    };

    const onMove = (e: PointerEvent) => {
      const pending = pendingDragRef.current;
      if (!pending || e.pointerId !== pending.pointerId) return;
      const dx = e.clientX - pending.startX;
      const dy = e.clientY - pending.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

      // Real movement — lift the card into the overlay. The dragging effect
      // binds the framer session to the overlay next frame.
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      pendingDragRef.current = null;

      dragRef.current = { card: pending.card, from: pending.from };
      dragEventRef.current = e;
      movedRef.current = true;
      setOverlayRect({
        x: pending.rect.x,
        y: pending.rect.y,
        width: pending.rect.width,
        height: pending.rect.height,
      });
      setDragging({ card: pending.card, from: pending.from });

      // Safety net: pointer released before framer's session binds → settle.
      const onFallback = () => {
        if (sessionStartedRef.current) return;
        settleDrag();
      };
      dragFallbackRef.current = onFallback;
      window.addEventListener('pointerup', onFallback);
      window.addEventListener('pointercancel', onFallback);
    };

    const onUp = () => {
      // No threshold crossed — a tap/click. The card was never lifted, so the
      // browser click lands on it and selection happens in the card's onClick.
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      pendingDragRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Start the drag session once the overlay is mounted, using the pointer
  // event captured when the drag committed.
  useEffect(() => {
    if (!dragging || sessionStartedRef.current) return;
    const event = dragEventRef.current;
    if (!event) return;
    sessionStartedRef.current = true;
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

    removeDragFallback();
    sessionStartedRef.current = false;
    dragRef.current = null;
    dragEventRef.current = null;
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
    // sync with the DB. On rejection (e.g. role 403) the card snaps back to
    // the server's grouping — direct state revert, no refetch round-trip.
    if (targetStatus !== drag.from) {
      Promise.resolve(onStatusChange?.(drag.card.id, targetStatus)).catch(
        () => {
          setColumns(groupByStatus(projects, search));
        },
      );
    }

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
                    onPointerDown={(event) => beginDrag(event, item, status)}
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
