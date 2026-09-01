'use client';

import { ShieldAlert, User, UserX, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import type { WorkspaceMemberCard } from '@shipyard/shared';

import { useToast } from '@/components/providers/toast-provider';
import { useRemoveMember } from '@/hooks/use-members';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

interface RemoveMemberDialogProps {
  member: WorkspaceMemberCard;
  slug: string;
  workspaceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stats?: { projectsOwned?: number };
}

export function RemoveMemberDialog({
  member,
  slug,
  workspaceName,
  open,
  onOpenChange,
  stats,
}: RemoveMemberDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <RemoveMemberDialogContent
          key={open ? 'open' : 'closed'}
          member={member}
          slug={slug}
          workspaceName={workspaceName}
          onOpenChange={onOpenChange}
          stats={stats}
        />
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function RemoveMemberDialogContent({
  member,
  slug,
  workspaceName,
  onOpenChange,
  stats,
}: {
  member: WorkspaceMemberCard;
  slug: string;
  workspaceName: string;
  onOpenChange: (open: boolean) => void;
  stats?: { projectsOwned?: number };
}) {
  const { showToast } = useToast();

  const removeMutation = useRemoveMember(slug, {
    onSuccess: (data) => {
      const count = data.transferredProjects;
      showToast({
        status: 'success',
        title: 'Member removed',
        description:
          count > 0
            ? `${member.name} removed. ${count} project${count === 1 ? '' : 's'} transferred to the Workspace Owner.`
            : `${member.name} removed from ${workspaceName}.`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to remove member',
        description: error.message,
      });
    },
  });

  const busy = removeMutation.isPending;

  const confirm = () => {
    if (busy) return;
    removeMutation.mutate({ memberId: member.id });
  };

  const projectsOwned = stats?.projectsOwned ?? 0;

  return (
    <>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#16151259] backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[520px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-xl border border-ds-border bg-ds-surface p-[26px] shadow-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        )}
      >
        {/* Head row — danger tile + title/subtitle */}
        <div className="flex w-full items-center gap-3.5">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#F1C9C2] bg-ds-danger-soft"
          >
            <UserX className="size-[22px] text-ds-danger" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DialogPrimitive.Title className="text-[17px] font-bold leading-none tracking-[-0.4px] text-foreground">
              Remove member?
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-ds-danger">
              Removes access immediately
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

        {/* Body message */}
        <p className="text-[13px] leading-[1.6] text-muted-foreground">
          {member.name} will lose access to {workspaceName} immediately. Any
          projects they own transfer automatically to the Workspace Owner — you
          can’t choose a different recipient.
        </p>

        {/* Target member row — avatar uses image when available, fallback initials danger-soft */}
        <div className="flex w-full items-center gap-3 rounded-[10px] border border-ds-border bg-ds-bg px-3 py-2.5">
          {member.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.image}
              alt=""
              className="size-9 shrink-0 rounded-full border object-cover"
            />
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#F1C9C2] bg-ds-danger-soft font-mono text-xs font-bold text-ds-danger">
              {initialsOf(member.name)}
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] font-semibold leading-none text-foreground">
              {member.name}
            </span>
            <span className="truncate text-[11px] leading-none text-muted-foreground">
              {member.email} ·{' '}
              {member.role === 'ADMIN'
                ? 'Admin'
                : member.role === 'OWNER'
                  ? 'Owner'
                  : 'Member'}
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

        {/* Transfer note — warning-soft */}
        <div className="flex w-full items-center gap-2 rounded-lg border border-[#EDD9A8] bg-ds-warning-soft px-3 py-2.5">
          <ShieldAlert
            className="size-[13px] shrink-0 text-ds-warning"
            aria-hidden
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-xs font-semibold leading-none text-foreground">
              {projectsOwned > 0
                ? `${projectsOwned} owned project${projectsOwned === 1 ? '' : 's'} will transfer`
                : 'Projects will transfer to Owner if any'}
            </span>
            <span className="text-[10.5px] leading-none text-muted-foreground">
              Ownership moves to the Workspace Owner, including archived
              projects.
            </span>
          </div>
        </div>

        {/* Footer — Cancel / Remove member */}
        <div className="flex w-full items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-9 gap-2 rounded-md px-4 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={confirm}
            disabled={busy}
            className="h-9 gap-2 rounded-md px-4 text-sm font-semibold"
          >
            {busy ? (
              <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <UserX className="size-4" aria-hidden />
            )}
            {busy ? 'Removing…' : 'Remove member'}
          </Button>
        </div>
      </DialogPrimitive.Content>
    </>
  );
}
