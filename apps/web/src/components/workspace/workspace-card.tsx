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
  OWNER: 'border border-ds-border bg-ds-brand-soft text-ds-brand',
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
      <IconWrapper
        icon={workspace.icon}
        size={isArchived ? 'sm' : 'md'}
        variant={isArchived ? 'outline' : 'soft'}
        className={cn(
          isArchived &&
            'bg-ds-surface-subtle text-muted-foreground border-ds-border',
        )}
      />

      {/* Name + meta — w-full keeps truncation working under items-start */}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 sm:gap-1">
        <span
          className={cn(
            'w-full truncate text-[13px] font-semibold leading-none tracking-[-0.2px] text-foreground sm:text-[15px]',
            isArchived && 'text-muted-foreground',
          )}
        >
          {workspace.name}
        </span>
        <span className="w-full truncate text-[10px] leading-[1.3] text-muted-foreground sm:text-[11px]">
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
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50 sm:h-9 sm:gap-2 sm:px-3.5 sm:text-xs"
        >
          <ArchiveRestore className="h-3.5 w-3.5 sm:h-[15px] sm:w-[15px]" />
          Restore
        </button>
      ) : (
        <>
          <span
            className={cn(
              'hidden h-[22px] shrink-0 items-center gap-1.5 rounded-full px-2.5 font-mono text-[9px] font-semibold tracking-[0.8px] sm:inline-flex',
              ROLE_CHIP_CLASS[role],
            )}
          >
            {roleInfo.label}
          </span>
          <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground sm:hidden" />
        </>
      )}
    </>
  );

  const classNameBase = cn(
    'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors sm:gap-3.5 sm:px-4 sm:py-0',
    isArchived
      ? 'min-h-[56px] border-ds-border bg-ds-surface-subtle sm:h-[60px] sm:min-h-0'
      : 'min-h-[60px] border-ds-border-strong bg-ds-surface sm:h-[68px] sm:min-h-0',
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
