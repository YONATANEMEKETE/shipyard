'use client';

import { motion, useReducedMotion } from 'motion/react';
import { ArchiveRestore, ChevronRight } from 'lucide-react';

import type { WorkspaceCard as WorkspaceCardData } from '@shipyard/shared';
import { cn } from '@/lib/utils';
import { IconWrapper } from '@/components/workspace/icon-wrapper';

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER';

// The shared WorkspaceCard contract carries OWNER | MEMBER (ADMIN arrives in
// F3); the card already renders all three role styles, so its input widens
// the role to preview them.
export type WorkspaceCardInput = Omit<WorkspaceCardData, 'role'> & {
  role: WorkspaceRole;
};

export interface WorkspaceCardProps {
  workspace: WorkspaceCardInput;
  /** Role displayed on the card. Defaults to the workspace role. */
  role?: WorkspaceRole;
  onSelect?: () => void;
  onRestore?: () => void;
  className?: string;
}

const ROLE_META: Record<WorkspaceRole, { label: string; prefix: string }> = {
  OWNER: { label: 'OWNER', prefix: "You're the Owner" },
  ADMIN: { label: 'ADMIN', prefix: "You're an Admin" },
  MEMBER: { label: 'MEMBER', prefix: "You're a Member" },
};

// Two role styles: amber for the Owner, neutral gray for Admin and Member.
const ROLE_CHIP_CLASS: Record<WorkspaceRole, string> = {
  OWNER: 'border border-amber-200 bg-amber-50 text-amber-700',
  ADMIN: 'border border-border bg-secondary text-muted-foreground',
  MEMBER: 'border border-border bg-secondary text-muted-foreground',
};

export function WorkspaceCard({
  workspace,
  role = workspace.role,
  onSelect,
  onRestore,
  className,
}: WorkspaceCardProps) {
  const reduce = useReducedMotion();
  const isArchived = workspace.status === 'ARCHIVED';
  const roleInfo = ROLE_META[role];

  const meta = isArchived
    ? `Archived · ${roleInfo.prefix} · restore to reopen`
    : `${roleInfo.prefix} · ${workspace.memberCount} members`;

  const content = (
    <>
      {/* Icon tile */}
      <IconWrapper
        icon={isArchived ? null : workspace.icon}
        size={isArchived ? 'sm' : 'md'}
        variant={isArchived ? 'outline' : 'soft'}
        className={cn(
          isArchived && 'bg-secondary/60 text-muted-foreground border-border',
        )}
      />

      {/* Name + meta */}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span
          className={cn(
            'truncate text-[15px] font-semibold leading-none tracking-[-0.2px] text-foreground',
            isArchived && 'text-muted-foreground',
          )}
        >
          {workspace.name}
        </span>
        <span className="truncate text-[11px] leading-[1.3] text-muted-foreground">
          {meta}
        </span>
      </div>

      {isArchived ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRestore?.();
          }}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-xs font-semibold text-foreground transition-colors hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50"
        >
          <ArchiveRestore className="h-[15px] w-[15px]" />
          Restore
        </button>
      ) : (
        <>
          <span
            className={cn(
              'inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full px-2.5 font-mono text-[9px] font-semibold tracking-[0.8px]',
              ROLE_CHIP_CLASS[role],
            )}
          >
            {roleInfo.label}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </>
      )}
    </>
  );

  const classNameBase = cn(
    'flex w-full items-center gap-3.5 rounded-xl border px-4 transition-colors',
    isArchived
      ? 'h-[60px] border-ds-border bg-ds-surface-subtle'
      : 'h-[68px] border-ds-border-strong bg-ds-surface',
    !isArchived && 'hover:border-ds-border hover:bg-ds-surface-subtle',
    className,
  );

  if (isArchived) {
    return <div className={classNameBase}>{content}</div>;
  }

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileTap={reduce ? undefined : { scale: 0.995 }}
      transition={{ type: 'spring', duration: 0.35, bounce: 0.2 }}
      className={classNameBase}
    >
      {content}
    </motion.button>
  );
}
