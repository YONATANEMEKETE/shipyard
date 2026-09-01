'use client';

import {
  ArrowRight,
  Check,
  Info,
  Shield,
  User,
  UserCog,
  X,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import type { WorkspaceMemberCard, WorkspaceRole } from '@shipyard/shared';

import { useToast } from '@/components/providers/toast-provider';
import { useChangeMemberRole } from '@/hooks/use-members';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Change role dialog — matches "Element / Change Role Confirmation" in
 * shipyard.pen. Owner-only surface (Member ⇄ Admin; the Owner's role is only
 * touched by transfer ownership). Preselects the role being switched TO
 * (per the pen: Member target shows Admin selected), and the confirm button
 * stays disabled until a different role is picked. Posts to
 * PATCH /api/v1/workspaces/:slug/members/:memberId/role via
 * useChangeMemberRole, toasts the result and closes on success — the hook
 * refreshes the directory + details cache.
 *
 * Content is keyed by open state so the selection resets on every open.
 */
interface ChangeRoleDialogProps {
  member: WorkspaceMemberCard;
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLE_OPTIONS: {
  value: 'MEMBER' | 'ADMIN';
  icon: typeof User;
  title: string;
  description: string;
}[] = [
  {
    value: 'MEMBER',
    icon: User,
    title: 'Member',
    description: 'Create issues & comment',
  },
  {
    value: 'ADMIN',
    icon: Shield,
    title: 'Admin',
    description: 'Manage projects · cycles · invite',
  },
];

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

export function ChangeRoleDialog({
  member,
  slug,
  open,
  onOpenChange,
}: ChangeRoleDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <ChangeRoleDialogContent
          key={open ? 'open' : 'closed'}
          member={member}
          slug={slug}
          onOpenChange={onOpenChange}
        />
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ChangeRoleDialogContent({
  member,
  slug,
  onOpenChange,
}: {
  member: WorkspaceMemberCard;
  slug: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { showToast } = useToast();

  // One-directional by design: a Member target's only destination is Admin
  // and vice-versa — the current role card is disabled and the destination
  // role is preselected (pen: Member target shows Admin selected). No role
  // picking, just confirm.
  const destRole: 'MEMBER' | 'ADMIN' =
    member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN';

  const changeMutation = useChangeMemberRole(slug, {
    onSuccess: (updated) => {
      showToast({
        status: 'success',
        title: 'Role changed',
        description: `${updated.name} is now ${updated.role.toLowerCase()}.`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to change role',
        description: error.message,
      });
    },
  });

  const busy = changeMutation.isPending;

  const confirm = () => {
    if (busy) return;
    changeMutation.mutate({ memberId: member.id, body: { role: destRole } });
  };

  return (
    <>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#16151259] backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[520px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-[22px] overflow-y-auto rounded-xl border border-ds-border bg-ds-surface p-[26px] shadow-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        )}
      >
        {/* Head row — icon tile + title/subtitle */}
        <div className="flex w-full items-center gap-3.5">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-ds-brand/40 bg-ds-brand-soft"
          >
            <UserCog className="size-[22px] text-ds-brand" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DialogPrimitive.Title className="text-[17px] font-bold leading-none tracking-[-0.4px] text-foreground">
              Change role
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
              Owner only · takes effect immediately
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

        {/* Target member row */}
        <div className="flex w-full items-center gap-3 rounded-[10px] border border-ds-border bg-ds-bg px-3 py-2.5">
          {member.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.image}
              alt=""
              className="size-9 shrink-0 rounded-full border object-cover"
            />
          ) : (
            <span
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-full border font-mono text-xs font-bold',
                AVATAR_TONE[member.role],
              )}
            >
              {initialsOf(member.name)}
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] font-semibold leading-none text-foreground">
              {member.name}
            </span>
            <span className="truncate text-[11px] leading-none text-muted-foreground">
              {member.email} · Member since {formatJoined(member.createdAt)}
            </span>
          </div>
          <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-ds-border bg-ds-surface px-2.5">
            <User className="size-3 text-muted-foreground" aria-hidden />
            <span className="text-[11px] font-semibold leading-none text-muted-foreground">
              {member.role === 'OWNER'
                ? 'Owner'
                : member.role === 'ADMIN'
                  ? 'Admin'
                  : 'Member'}
            </span>
          </span>
        </div>

        {/* Role selector — two selectable cards (Member ⇄ Admin) */}
        <div className="flex w-full flex-col gap-2">
          <span className="text-[11px] font-semibold text-foreground">
            Role change · {member.role === 'ADMIN' ? 'Admin' : 'Member'} →{' '}
            {destRole === 'ADMIN' ? 'Admin' : 'Member'}
          </span>
          <div
            role="radiogroup"
            aria-label="New role"
            className="flex w-full gap-2.5"
          >
            {ROLE_OPTIONS.map((option) => {
              const isCurrent = option.value === member.role;
              const isDest = option.value === destRole;
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isDest}
                  disabled={isCurrent}
                  className={cn(
                    'flex h-[72px] w-full min-w-0 flex-1 items-center gap-2.5 rounded-[10px] border bg-ds-surface px-3 text-left transition-colors',
                    isDest
                      ? 'border-ds-brand bg-ds-brand-soft'
                      : 'border-ds-border',
                    isCurrent &&
                      'cursor-not-allowed opacity-60 aria-disabled:cursor-not-allowed',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-lg border',
                      isDest
                        ? 'border-ds-brand/40 bg-ds-surface'
                        : 'border-ds-border bg-ds-bg',
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-4',
                        isDest ? 'text-ds-brand' : 'text-muted-foreground',
                      )}
                      aria-hidden
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[13px] font-semibold leading-none text-foreground">
                      {option.title}
                    </span>
                    <span className="truncate text-[10.5px] leading-none text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-[18px] shrink-0 place-items-center rounded-full',
                      isDest
                        ? 'bg-ds-brand'
                        : 'border-[1.5px] border-ds-border-strong',
                    )}
                  >
                    {isDest ? (
                      <span className="size-[7px] rounded-full bg-ds-surface" />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Transition row — current → destination (fixed direction) */}
        <div className="flex w-full items-center justify-center gap-2">
          <span className="inline-flex h-[22px] items-center rounded-full border border-ds-border bg-ds-surface px-2 text-[10px] font-semibold text-muted-foreground">
            {member.role === 'ADMIN' ? 'Admin' : 'Member'}
          </span>
          <ArrowRight className="size-3.5 shrink-0 text-ds-brand" aria-hidden />
          <span
            className={cn(
              'inline-flex h-[22px] items-center rounded-full border px-2 text-[10px] font-semibold',
              destRole === 'ADMIN'
                ? 'border-ds-brand/40 bg-ds-brand-soft text-ds-brand'
                : 'border-ds-border bg-ds-surface text-muted-foreground',
            )}
          >
            {destRole === 'ADMIN' ? 'Admin' : 'Member'}
          </span>
        </div>

        {/* Info note */}
        <div className="flex w-full items-center gap-2 rounded-lg border border-ds-border bg-secondary px-3 py-2.5">
          <Info
            className="size-[13px] shrink-0 text-muted-foreground"
            aria-hidden
          />
          <p className="text-[11px] font-normal leading-[1.5] text-muted-foreground">
            Member → Admin grants project, cycle, and invite access. Admin →
            Member removes it. Owner can&apos;t be changed here — use Transfer
            ownership.
          </p>
        </div>

        {/* Footer — Cancel / Confirm change */}
        <div className="flex w-full items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-9 gap-2 rounded-md px-4 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
            Cancel
          </Button>
          <Button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Check className="size-4" aria-hidden />
            )}
            {busy ? 'Changing…' : 'Confirm change'}
          </Button>
        </div>
      </DialogPrimitive.Content>
    </>
  );
}
