'use client';

import { ChevronRight, Shield, UserCog, UserX, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import type { WorkspaceMemberCard, WorkspaceRole } from '@shipyard/shared';

import { MemberBadge } from '@/components/members/member-badge';
import { cn } from '@/lib/utils';

/**
 * Member details dialog — matches "Element / Member Details Modal" in
 * shipyard.pen (owner view) with permission-aware variants:
 *  - OWNER viewer sees Management (Change role / Transfer ownership) + Danger
 *    (Remove member) sections — actions hidden when the target is the Owner
 *    itself or the viewer (Owner cage, API-enforced anyway).
 *  - ADMIN viewer sees only the Danger section → Remove member (Admin can only
 *    remove Members — hidden for ADMIN/OWNER targets, mirroring "Member
 *    Details Modal — Admin").
 *  - MEMBER viewer sees identity + definition list only (read-only).
 * Action rows are UI-only for now — the Change Role / Transfer Ownership /
 * Remove confirmations land next. Data beyond the member card (project/cycle/
 * issue counts) defaults to 0 via `stats` until the details endpoint supplies
 * them.
 */

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const AVATAR_TONE: Record<WorkspaceRole, string> = {
  OWNER: 'border-ds-brand/40 bg-ds-brand text-white',
  ADMIN: 'border-ds-info/30 bg-ds-info-soft text-ds-info',
  MEMBER: 'border-ds-border bg-ds-surface-subtle text-muted-foreground',
};

export interface MemberStats {
  projectsOwned: number;
  cyclesAssigned: number;
  issuesAssigned: number;
}

interface MemberDetailsDialogProps {
  member: WorkspaceMemberCard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
  /** Viewer's role on this workspace — drives which action sections render. */
  viewerRole?: WorkspaceRole;
  currentUserId?: string;
  /** Display counts from the details endpoint — UI-only until it exists. */
  stats?: Partial<MemberStats>;
}

export function MemberDetailsDialog({
  member,
  open,
  onOpenChange,
  workspaceName,
  viewerRole,
  currentUserId,
  stats,
}: MemberDetailsDialogProps) {
  const isSelf = member.userId === currentUserId;
  const isOwner = member.role === 'OWNER';
  const viewerCanManage = viewerRole === 'OWNER' && !isOwner && !isSelf;

  // Remove is the only action Admins get, and only against Members.
  const viewerCanRemove =
    (viewerRole === 'OWNER' && !isOwner && !isSelf) ||
    (viewerRole === 'ADMIN' && member.role === 'MEMBER');

  const rows: { label: string; value: string; divider?: boolean }[] = [
    {
      label: 'Status',
      value: `Active · Member since ${formatJoined(member.createdAt)}`,
    },
    {
      label: 'Projects',
      value: `${stats?.projectsOwned ?? 0} owned`,
      divider: true,
    },
    {
      label: 'Cycles',
      value: `${stats?.cyclesAssigned ?? 0} assigned`,
      divider: true,
    },
    {
      label: 'Issues',
      value: `${stats?.issuesAssigned ?? 0} assigned`,
      divider: true,
    },
  ];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#16151259] backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[520px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-xl border border-ds-border bg-ds-surface shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          {/* Header — title + workspace subcopy, close on the right */}
          <div className="flex w-full items-center gap-3 px-6 pt-6">
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <DialogPrimitive.Title className="text-[17px] font-bold leading-none tracking-[-0.4px] text-foreground">
                Member details
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs leading-none text-muted-foreground">
                {workspaceName}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-[14px]" aria-hidden />
              </button>
            </DialogPrimitive.Close>
          </div>

          {/* Identity block — avatar, name, email, role pill */}
          <div className="flex w-full items-center gap-4 px-6 pb-5 pt-6">
            {member.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.image}
                alt=""
                className="size-14 shrink-0 rounded-full border object-cover"
              />
            ) : (
              <span
                className={cn(
                  'grid size-14 shrink-0 place-items-center rounded-full border font-mono text-base font-bold',
                  AVATAR_TONE[member.role],
                )}
              >
                {initialsOf(member.name)}
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <span className="truncate text-base font-bold leading-none text-foreground">
                {member.name}
              </span>
              <span className="truncate text-xs leading-none text-muted-foreground">
                {member.email}
              </span>
              <span className="mt-1">
                <MemberBadge role={member.role} />
              </span>
            </div>
          </div>

          {/* Definition list — Status / Projects / Cycles / Issues */}
          <div className="w-full px-6">
            {rows.map((row) => (
              <div
                key={row.label}
                className={cn(
                  'flex h-9 w-full items-center gap-3',
                  row.divider && 'border-b border-ds-border',
                )}
              >
                <span className="text-[11px] leading-none text-muted-foreground">
                  {row.label}
                </span>
                <span className="h-px min-w-0 flex-1" aria-hidden />
                <span className="text-xs font-medium leading-none text-foreground">
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* Management — OWNER viewer only (never for the Owner target or self) */}
          {viewerCanManage ? (
            <div className="flex w-full flex-col gap-2.5 px-6 pb-2 pt-6">
              <button
                type="button"
                className="flex h-11 w-full items-center gap-3 rounded-lg border border-ds-border bg-ds-bg px-3 text-left transition-colors hover:border-ds-border-strong"
              >
                <UserCog
                  className="size-[15px] shrink-0 text-ds-brand"
                  aria-hidden
                />
                <span className="flex-1 text-[13px] font-semibold leading-none text-foreground">
                  Change role
                </span>
                <ChevronRight
                  className="size-[15px] shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </button>
              <button
                type="button"
                className="flex h-11 w-full items-center gap-3 rounded-lg border border-ds-border bg-ds-bg px-3 text-left transition-colors hover:border-ds-border-strong"
              >
                <Shield
                  className="size-[15px] shrink-0 text-ds-brand"
                  aria-hidden
                />
                <span className="flex-1 text-[13px] font-semibold leading-none text-foreground">
                  Transfer ownership
                </span>
                <ChevronRight
                  className="size-[15px] shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </button>
            </div>
          ) : null}

          {/* Danger zone — Remove member (role-limited per the matrix) */}
          {viewerCanRemove ? (
            <div className="flex w-full flex-col gap-2.5 px-6 pb-6 pt-6">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-ds-danger">
                Danger zone
              </span>
              <button
                type="button"
                className="flex h-11 w-full items-center gap-3 rounded-lg border border-ds-danger/30 bg-ds-danger-soft px-3 text-left transition-colors hover:border-ds-danger/60"
              >
                <UserX
                  className="size-[15px] shrink-0 text-ds-danger"
                  aria-hidden
                />
                <span className="flex-1 text-[13px] font-semibold leading-none text-ds-danger">
                  Remove member
                </span>
                <ChevronRight
                  className="size-[15px] shrink-0 text-ds-danger"
                  aria-hidden
                />
              </button>
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
