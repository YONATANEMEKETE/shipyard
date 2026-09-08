'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Inbox, RotateCw } from 'lucide-react';
import { motion, useDragControls } from 'motion/react';
import type { IssueCard, IssueStatus } from '@shipyard/shared';

import { IssueKanbanCard } from '@/components/issues/issue-kanban-card';
import { Loader } from '@/components/motion/loader';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Plus } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { useCycles } from '@/hooks/use-cycles';

const STATUS_ORDER: IssueStatus[] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE'];

const CARD_GAP = 10;
const DRAG_THRESHOLD = 5;

const DOT_COLOR: Record<IssueStatus, string> = {
  BACKLOG: 'bg-ds-text-muted',
  TODO: 'bg-ds-info',
  IN_PROGRESS: 'bg-ds-brand',
  DONE: 'bg-ds-success',
};

const STATUS_LABEL: Record<IssueStatus, string> = {
  BACKLOG: 'Backlog',
  TODO: 'Todo',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
};

function groupByStatus(
  issues: IssueCard[],
  search = '',
): Record<IssueStatus, IssueCard[]> {
  const q = search.trim().toLowerCase();
  const visible =
    q === ''
      ? issues
      : issues.filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.identifier.toLowerCase().includes(q),
        );
  return {
    BACKLOG: visible.filter((i) => i.status === 'BACKLOG'),
    TODO: visible.filter((i) => i.status === 'TODO'),
    IN_PROGRESS: visible.filter((i) => i.status === 'IN_PROGRESS'),
    DONE: visible.filter((i) => i.status === 'DONE'),
  };
}

function KanbanColumn({
  status,
  count,
  onAdd,
  isDropTarget = false,
  children,
}: {
  status: IssueStatus;
  count: number;
  onAdd?: () => void;
  isDropTarget?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      data-column-status={status}
      className={cn(
        'flex h-full min-w-[280px] flex-1 flex-col gap-3 rounded-xl border bg-ds-sidebar p-3 transition-colors',
        isDropTarget ? 'border-ds-brand border-[1.5px]' : 'border-ds-border',
      )}
    >
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
        {status !== 'DONE' ? (
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
        ) : null}
      </div>
      <div
        data-column-body
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </section>
  );
}

export function IssuesKanbanView({
  slug,
  issues,
  search = '',
  onOpenIssue,
  onAddIssue,
  onStatusChange,
  loading = false,
  error = false,
  onRetry,
}: {
  slug: string;
  issues: IssueCard[];
  search?: string;
  onOpenIssue?: (id: string) => void;
  onAddIssue?: (status: IssueStatus) => void;
  onStatusChange?: (
    issueId: string,
    status: IssueStatus,
  ) => Promise<unknown> | void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const [columns, setColumns] = useState<Record<IssueStatus, IssueCard[]>>(() =>
    groupByStatus(issues, search),
  );

  const [syncedIssues, setSyncedIssues] = useState(issues);
  const [syncedSearch, setSyncedSearch] = useState(search);
  if (syncedIssues !== issues || syncedSearch !== search) {
    setSyncedIssues(issues);
    setSyncedSearch(search);
    setColumns(groupByStatus(issues, search));
  }

  const { data: projectsData } = useProjects(slug);
  const { data: cyclesData } = useCycles(slug);
  const projectMap = new Map(
    (projectsData?.projects ?? []).map((p) => [p.id, p.name] as const),
  );
  const cycleMap = new Map(
    (cyclesData?.cycles ?? []).map((c) => [c.id, c.name] as const),
  );

  const columnRefs = useRef<Record<IssueStatus, HTMLElement | null>>({
    BACKLOG: null,
    TODO: null,
    IN_PROGRESS: null,
    DONE: null,
  });
  const boardRef = useRef<HTMLDivElement>(null);

  const dragRef = useRef<{ card: IssueCard; from: IssueStatus } | null>(null);
  const dragEventRef = useRef<PointerEvent | null>(null);
  const [dragging, setDragging] = useState<{
    card: IssueCard;
    from: IssueStatus;
  } | null>(null);
  const [overlayRect, setOverlayRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<IssueStatus | null>(null);
  const [dropIndex, setDropIndex] = useState(0);
  const movedRef = useRef(false);

  const dragControls = useDragControls();

  const pendingDragRef = useRef<{
    card: IssueCard;
    from: IssueStatus;
    pointerId: number;
    startX: number;
    startY: number;
    rect: DOMRect;
  } | null>(null);
  const sessionStartedRef = useRef(false);
  const dragFallbackRef = useRef<(() => void) | null>(null);

  const removeDragFallback = () => {
    const fallback = dragFallbackRef.current;
    if (fallback) {
      window.removeEventListener('pointerup', fallback);
      window.removeEventListener('pointercancel', fallback);
      dragFallbackRef.current = null;
    }
  };

  const settleDrag = () => {
    removeDragFallback();
    sessionStartedRef.current = false;
    pendingDragRef.current = null;
    dragRef.current = null;
    dragEventRef.current = null;
    setDropTarget(null);
    setDragging(null);
    setOverlayRect(null);
    window.setTimeout(() => {
      movedRef.current = false;
    }, 0);
  };

  const beginDrag = (
    event: React.PointerEvent<HTMLElement>,
    card: IssueCard,
    from: IssueStatus,
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

      const onFallback = () => {
        if (sessionStartedRef.current) return;
        settleDrag();
      };
      dragFallbackRef.current = onFallback;
      window.addEventListener('pointerup', onFallback);
      window.addEventListener('pointercancel', onFallback);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      pendingDragRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  useEffect(() => {
    if (!dragging || sessionStartedRef.current) return;
    const event = dragEventRef.current;
    if (!event) return;
    sessionStartedRef.current = true;
    const frame = requestAnimationFrame(() => dragControls.start(event));
    return () => cancelAnimationFrame(frame);
  }, [dragging, dragControls]);

  const resolveDrop = (
    x: number,
    y: number,
  ): { status: IssueStatus; index: number } | null => {
    const drag = dragRef.current;
    if (!drag || !overlayRect) return null;

    let target: IssueStatus | null = null;
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

    if (targetStatus !== drag.from) {
      Promise.resolve(onStatusChange?.(drag.card.id, targetStatus)).catch(
        () => {
          setColumns(groupByStatus(issues, search));
        },
      );
    }

    setDragging(null);
    setOverlayRect(null);
    window.setTimeout(() => {
      movedRef.current = false;
    }, 0);
  };

  const renderColumn = (status: IssueStatus) => {
    const cards = columns[status].filter((c) => c.id !== dragging?.card.id);
    const isDropTarget = dragging !== null && dropTarget === status;
    let insertIndex = dropIndex;
    if (isDropTarget)
      insertIndex = Math.max(0, Math.min(cards.length, dropIndex));

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

    const items: (IssueCard | { slot: true })[] = [...cards];
    if (isDropTarget) items.splice(insertIndex, 0, { slot: true });

    const showEmpty = !isDropTarget && cards.length === 0;

    return (
      <div
        key={status}
        ref={(el) => {
          columnRefs.current[status] = el;
        }}
        className="h-full min-w-[280px] flex-1"
      >
        <KanbanColumn
          status={status}
          count={cards.length}
          isDropTarget={isDropTarget}
          onAdd={() => onAddIssue?.(status)}
        >
          {showEmpty ? (
            <EmptyState
              icon={Inbox}
              title="No issues here"
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
                    projectName={
                      item.projectId
                        ? (projectMap.get(item.projectId) ?? null)
                        : null
                    }
                    cycleName={
                      item.cycleId ? (cycleMap.get(item.cycleId) ?? null) : null
                    }
                    onPointerDown={(e) => beginDrag(e, item, status)}
                    onOpenIssue={onOpenIssue}
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

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-ds-border bg-ds-surface">
        <Loader size={32} variant="spinner" label="Loading issues" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-ds-border bg-ds-surface">
        <ErrorState
          title="Couldn't load issues"
          description="We ran into a problem fetching the board. Try again in a moment."
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
              <IssueKanbanCard
                issue={dragging.card}
                projectName={
                  dragging.card.projectId
                    ? (projectMap.get(dragging.card.projectId) ?? null)
                    : null
                }
                cycleName={
                  dragging.card.cycleId
                    ? (cycleMap.get(dragging.card.cycleId) ?? null)
                    : null
                }
                onOpen={() => onOpenIssue?.(dragging.card.id)}
              />
            </motion.div>,
            document.body,
          )
        : null}
    </>
  );
}

function CardItem({
  card,
  projectName,
  cycleName,
  onPointerDown,
  onOpenIssue,
  movedRef,
}: {
  card: IssueCard;
  projectName?: string | null;
  cycleName?: string | null;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onOpenIssue?: (id: string) => void;
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
      <IssueKanbanCard
        issue={card}
        projectName={projectName}
        cycleName={cycleName}
        onPointerDown={onPointerDown}
        onOpen={() => {
          if (movedRef.current) {
            movedRef.current = false;
            return;
          }
          onOpenIssue?.(card.id);
        }}
      />
    </motion.div>
  );
}
