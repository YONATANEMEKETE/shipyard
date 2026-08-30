'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Archive, Check, ChevronsUpDown, Plus } from 'lucide-react';

import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { IconWrapper } from '@/components/workspace/icon-wrapper';
import { CreateWorkspaceDialog } from '@/components/workspace/create-workspace-dialog';
import { useWorkspaces } from '@/hooks/use-workspaces';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/ease';
import { isArchived } from '@/lib/workspace/is-archived';

interface WorkspaceOption {
  slug: string;
  name: string;
  icon: string | null;
  memberCount: number;
  role: string;
  status: string;
}

function SwitcherSkeleton({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <div className="mx-auto size-[38px] animate-pulse rounded-lg bg-ds-border/60" />
    );
  }
  return (
    <div className="flex h-[58px] w-full items-center gap-2.5 rounded-lg border border-ds-border bg-ds-surface px-2.5">
      <div className="size-[30px] shrink-0 animate-pulse rounded-lg bg-ds-border/60" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="h-3 w-24 animate-pulse rounded bg-ds-border/60" />
        <span className="h-2 w-16 animate-pulse rounded bg-ds-border/40" />
      </span>
    </div>
  );
}

function WorkspaceMark({ icon }: { icon: string | null }) {
  const key = icon ?? 'boxes';
  return (
    <span className="grid size-[30px] shrink-0 place-items-center rounded-lg border border-ds-border bg-ds-brand-soft">
      <IconWrapper
        icon={key}
        size="xs"
        variant="soft"
        className="border-0 bg-transparent"
      />
    </span>
  );
}

export function WorkspaceSwitcher({
  slug,
  collapsed = false,
}: {
  slug: string;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { data, isPending } = useWorkspaces();
  const workspaces: WorkspaceOption[] =
    data?.workspaces.map((w) => ({
      slug: w.slug,
      name: w.name,
      icon: w.icon,
      memberCount: w.memberCount,
      role: w.role,
      status: w.status,
    })) ?? [];
  const current = workspaces.find((workspace) => workspace.slug === slug);
  const others = workspaces.filter((workspace) => workspace.slug !== slug);

  // Close on outside click and Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const go = (nextSlug: string) => {
    setOpen(false);
    if (nextSlug !== slug) router.push(`/w/${nextSlug}`);
  };

  if (isPending) {
    return <SwitcherSkeleton collapsed={collapsed} />;
  }

  const row = (
    workspace: WorkspaceOption,
    isCurrent: boolean,
    onClick: () => void,
  ) => {
    const archived = isArchived(workspace);
    return (
      <button
        key={workspace.slug}
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
          archived
            ? 'bg-ds-surface-subtle text-muted-foreground hover:bg-ds-surface-subtle/80'
            : isCurrent
              ? 'bg-ds-surface text-foreground hover:bg-ds-sidebar'
              : 'text-foreground/80 hover:bg-ds-sidebar hover:text-foreground',
        )}
      >
        <WorkspaceMark icon={workspace.icon} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-[13px] font-medium text-foreground',
              archived && 'text-muted-foreground',
            )}
          >
            {workspace.name}
          </span>
          <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            {archived ? (
              <>
                <Archive className="h-3 w-3 shrink-0" />
                Archived · {workspace.role === 'OWNER' ? 'Owner' : 'Member'}
              </>
            ) : workspace.role === 'OWNER' ? (
              'Owner'
            ) : (
              'Member'
            )}
          </span>
        </span>
        {archived ? (
          <span className="inline-flex shrink-0 items-center rounded-full border border-ds-border bg-ds-surface px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.6px] text-muted-foreground">
            Archived
          </span>
        ) : isCurrent ? (
          <Check className="h-4 w-4 shrink-0 text-ds-brand" />
        ) : null}
      </button>
    );
  };

  const currentArchived = current ? isArchived(current) : false;

  return (
    <div ref={rootRef} className="relative">
      {/* Trigger — icon-only when the sidebar is collapsed */}
      {collapsed ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          title={current?.name ?? 'Select a workspace'}
          aria-label={current?.name ?? 'Select a workspace'}
          className="mx-auto grid size-[38px] place-items-center rounded-lg transition-colors hover:bg-accent"
        >
          <WorkspaceMark icon={current?.icon ?? 'boxes'} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            'flex h-[58px] w-full items-center gap-2.5 rounded-lg border px-2.5 text-left transition-colors',
            currentArchived
              ? 'border-ds-border bg-ds-surface-subtle'
              : 'border-ds-border bg-ds-surface hover:border-ds-border-strong',
          )}
        >
          <WorkspaceMark icon={current?.icon ?? 'boxes'} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              className={cn(
                'truncate text-[11px] font-semibold text-foreground',
                currentArchived && 'text-muted-foreground',
              )}
            >
              {current?.name ?? 'Select a workspace'}
            </span>
            <span className="flex items-center gap-1 truncate text-[8px] text-muted-foreground">
              {currentArchived ? (
                <>
                  <Archive className="h-3 w-3 shrink-0" />
                  Archived
                </>
              ) : current ? (
                current.role === 'OWNER' ? (
                  'Owner'
                ) : (
                  'Member'
                )
              ) : (
                'Pick a workspace'
              )}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      )}

      {/* Panel */}
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            role="menu"
            className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-xl border border-ds-border bg-ds-surface p-1.5 shadow-lg"
          >
            <Stagger stagger={0.03} delayChildren={0.02} className="contents">
              <StaggerItem>
                <p className="px-2.5 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[1px] text-muted-foreground">
                  Your workspaces
                </p>
              </StaggerItem>

              <StaggerItem>
                {current ? row(current, true, () => setOpen(false)) : null}
              </StaggerItem>

              <StaggerItem>
                {others.map((workspace) =>
                  row(workspace, false, () => go(workspace.slug)),
                )}
              </StaggerItem>

              <StaggerItem>
                <div className="mx-1 my-1 h-px bg-ds-border" />
              </StaggerItem>

              <StaggerItem>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    requestAnimationFrame(() => setCreateOpen(true));
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-foreground/80 transition-colors hover:bg-ds-sidebar hover:text-foreground"
                >
                  <span className="grid size-[30px] shrink-0 place-items-center rounded-lg border border-dashed border-ds-border-strong text-muted-foreground">
                    <Plus className="h-4 w-4" />
                  </span>
                  New workspace
                </button>
              </StaggerItem>
            </Stagger>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
