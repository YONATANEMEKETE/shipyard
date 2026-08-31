import { Crown } from 'lucide-react';
import type { WorkspaceRole } from '@shipyard/shared';

import { cn } from '@/lib/utils';

/**
 * Reusable member role badge — the "Role Pill" from shipyard.pen:
 * Owner amber with crown, Admin info-blue, Member neutral. Size snaps to
 * content (never a fixed column width); the surrounding cell controls the
 * column. `className` overrides colors for contextual variants.
 */

const ROLE_BADGE_STYLES: Record<
  WorkspaceRole,
  { label: string; className: string; icon?: boolean }
> = {
  OWNER: {
    label: 'Owner',
    className: 'border-ds-brand bg-ds-brand text-white',
    icon: true,
  },
  ADMIN: {
    label: 'Admin',
    className: 'border-[#C7D2FE] bg-ds-info-soft text-ds-info',
  },
  MEMBER: {
    label: 'Member',
    className: 'border-ds-border bg-ds-surface-subtle text-muted-foreground',
  },
};

export interface MemberBadgeProps {
  role: WorkspaceRole;
  /** Override the role's default colors for contextual variants. */
  className?: string;
}

export function MemberBadge({ role, className }: MemberBadgeProps) {
  const style = ROLE_BADGE_STYLES[role];

  return (
    <span
      className={cn(
        'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1.5 rounded-full border px-2.5 text-[10.5px] font-semibold',
        style.className,
        className,
      )}
    >
      {style.icon ? <Crown className="size-[11px]" aria-hidden /> : null}
      {style.label}
    </span>
  );
}
