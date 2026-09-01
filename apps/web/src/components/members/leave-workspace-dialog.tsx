'use client';

import { LogOut, ShieldAlert, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { useToast } from '@/components/providers/toast-provider';
import {
  useLeaveWorkspace,
  useMembers,
  useTransferOwnership,
} from '@/hooks/use-members';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { workspaceKeys } from '@/hooks/use-workspaces';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/motion/select';
import { clearSelectedWorkspace } from '@/lib/workspace/selected-workspace';

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

interface LeaveWorkspaceDialogProps {
  slug: string;
  workspaceName: string;
  workspaceRole?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeaveWorkspaceDialog({
  slug,
  workspaceName,
  workspaceRole,
  open,
  onOpenChange,
}: LeaveWorkspaceDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {workspaceRole === 'OWNER' ? (
          <LeaveOwnerContent
            key={open ? 'open-owner' : 'closed-owner'}
            slug={slug}
            workspaceName={workspaceName}
            onOpenChange={onOpenChange}
          />
        ) : (
          <LeaveMemberContent
            key={open ? 'open-member' : 'closed-member'}
            slug={slug}
            workspaceName={workspaceName}
            workspaceRole={workspaceRole}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function LeaveMemberContent({
  slug,
  workspaceName,
  workspaceRole,
  onOpenChange,
}: {
  slug: string;
  workspaceName: string;
  workspaceRole?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { showToast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const leaveMutation = useLeaveWorkspace(slug, {
    onSuccess: (data) => {
      const count = data.transferredProjects;
      showToast({
        status: 'success',
        title: 'Left workspace',
        description:
          count > 0
            ? `You left ${workspaceName}. ${count} project${count === 1 ? '' : 's'} moved to the Owner.`
            : `You left ${workspaceName}.`,
      });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
      queryClient.removeQueries({ queryKey: workspaceKeys.detail(slug) });
      try {
        clearSelectedWorkspace();
      } catch {}
      onOpenChange(false);
      router.push('/w');
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to leave workspace',
        description: error.message,
      });
    },
  });

  const busy = leaveMutation.isPending;
  const roleLabel = workspaceRole === 'ADMIN' ? 'Admin' : 'Member';

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
        {/* Head row */}
        <div className="flex w-full items-center gap-3.5">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#EDD9A8] bg-ds-warning-soft"
          >
            <LogOut className="size-[22px] text-ds-warning" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DialogPrimitive.Title className="text-[17px] font-bold leading-none tracking-[-0.4px] text-foreground">
              Leave {workspaceName}?
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
              {roleLabel} · Global access
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

        <p className="text-[13px] leading-[1.6] text-muted-foreground">
          You&apos;ll lose access to this workspace immediately. Any projects
          you own transfer automatically to the Workspace Owner.
        </p>

        <div className="flex w-full items-center gap-2 rounded-lg border border-[#EDD9A8] bg-ds-warning-soft px-3 py-2.5">
          <ShieldAlert
            className="size-[13px] shrink-0 text-ds-warning"
            aria-hidden
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-xs font-semibold leading-none text-foreground">
              Projects will transfer to Owner if any
            </span>
            <span className="text-[10.5px] leading-none text-muted-foreground">
              Ownership moves to the Workspace Owner — you can&apos;t choose
              who.
            </span>
          </div>
        </div>

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
            onClick={() => !busy && leaveMutation.mutate()}
            disabled={busy}
            className="h-9 gap-2 rounded-md px-4 text-sm font-semibold"
          >
            {busy ? (
              <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <LogOut className="size-4" aria-hidden />
            )}
            {busy ? 'Leaving…' : 'Leave workspace'}
          </Button>
        </div>
      </DialogPrimitive.Content>
    </>
  );
}

function LeaveOwnerContent({
  slug,
  workspaceName,
  onOpenChange,
}: {
  slug: string;
  workspaceName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const membersQuery = useMembers(slug);

  const eligible = useMemo(() => {
    const all = membersQuery.data?.members ?? [];
    const selfId = session?.user.id;
    return all.filter((m) => m.role !== 'OWNER' && m.userId !== selfId);
  }, [membersQuery.data?.members, session?.user.id]);

  const [targetId, setTargetId] = useState<string | undefined>(undefined);
  const effectiveTargetId = targetId ?? eligible[0]?.id;

  const transferMutation = useTransferOwnership(slug, {
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: workspaceKeys.detail(slug),
      });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
      showToast({
        status: 'success',
        title: 'Ownership transferred',
        description: `You are now Admin. ${workspaceName} has a new Owner.`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to transfer ownership',
        description: error.message,
      });
    },
  });

  const busy = transferMutation.isPending;
  const selected = eligible.find((m) => m.id === effectiveTargetId);

  const confirm = () => {
    if (!effectiveTargetId || busy) return;
    transferMutation.mutate({ targetMemberId: effectiveTargetId });
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
        <div className="flex w-full items-center gap-3.5">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#EDD9A8] bg-ds-warning-soft"
          >
            <LogOut className="size-[22px] text-ds-warning" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DialogPrimitive.Title className="text-[17px] font-bold leading-none tracking-[-0.4px] text-foreground">
              Transfer ownership before leaving
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-ds-warning">
              You&apos;re the workspace Owner
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

        <p className="text-[13px] leading-[1.6] text-muted-foreground">
          To leave this workspace you must first transfer ownership to another
          Member or Admin. You&apos;ll become an Admin, and the selected person
          becomes the new Owner. This can&apos;t be undone.
        </p>

        <div className="flex w-full flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-foreground">
            Transfer ownership to
          </span>
          {eligible.length === 0 ? (
            <div className="rounded-[10px] border border-ds-border bg-ds-bg px-3 py-3 text-[12px] text-muted-foreground">
              No eligible members — invite someone first.
            </div>
          ) : (
            <Select value={effectiveTargetId} onValueChange={setTargetId}>
              <SelectTrigger className="h-10 rounded-[10px] border-ds-border bg-ds-surface px-3 text-[12px]">
                <span className="flex items-center gap-2">
                  {selected?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selected.image}
                      alt=""
                      className="size-6 rounded-full border object-cover"
                    />
                  ) : (
                    <span className="grid size-6 place-items-center rounded-full border border-[#C9DAFF] bg-ds-info-soft font-mono text-[9px] font-bold text-ds-info">
                      {selected ? initialsOf(selected.name) : ''}
                    </span>
                  )}
                  <span
                    className={cn(
                      selected ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {selected
                      ? `${selected.name} · ${selected.role}`
                      : 'Select member'}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent>
                {eligible.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} · {m.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex w-full items-center gap-2 rounded-lg border border-[#EDD9A8] bg-ds-warning-soft px-3 py-2.5">
          <ShieldAlert
            className="size-[13px] shrink-0 text-ds-warning"
            aria-hidden
          />
          <p className="text-[11px] leading-[1.5] text-foreground">
            Both people&apos;s roles update at once. Projects you own move with
            you to the new Owner.
          </p>
        </div>

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
            disabled={busy || !effectiveTargetId}
            className="h-9 gap-2 rounded-md px-4 text-sm font-semibold"
          >
            {busy ? (
              <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <LogOut className="size-4" aria-hidden />
            )}
            {busy ? 'Transferring…' : 'Transfer & leave'}
          </Button>
        </div>
      </DialogPrimitive.Content>
    </>
  );
}
