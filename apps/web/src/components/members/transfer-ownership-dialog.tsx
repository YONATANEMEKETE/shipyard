'use client';

import {
  ArrowRight,
  ArrowRightLeft,
  Shield,
  ShieldAlert,
  X,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import type { WorkspaceMemberCard } from '@shipyard/shared';

import { useToast } from '@/components/providers/toast-provider';
import { useTransferOwnership } from '@/hooks/use-members';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { workspaceKeys } from '@/hooks/use-workspaces';
import { useSession } from '@/hooks/use-session';

/**
 * Transfer ownership dialog — matches "Element / Transfer Ownership
 * Confirmation" in shipyard.pen (x7P30z). Owner-only surface: confirms
 * swapping OWNER → ADMIN (caller) and the selected member → OWNER.
 * The pen shows the target pre-selected (Select Field with avatar/role +
 * Swap Preview You/Recipient). This dialog takes the target `member`
 * from the details dialog that opened it — the owner clicked
 * "Transfer ownership" on that member's row, so the dialog is already
 * scoped to that member. POSTs to
 * POST /api/v1/workspaces/:slug/transfer-ownership via
 * useTransferOwnership, toasts and invalidates member + workspace caches.
 */

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

interface TransferOwnershipDialogProps {
  member: WorkspaceMemberCard;
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransferOwnershipDialog({
  member,
  slug,
  open,
  onOpenChange,
}: TransferOwnershipDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <TransferOwnershipDialogContent
          key={open ? 'open' : 'closed'}
          member={member}
          slug={slug}
          onOpenChange={onOpenChange}
        />
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function TransferOwnershipDialogContent({
  member,
  slug,
  onOpenChange,
}: {
  member: WorkspaceMemberCard;
  slug: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const callerName = session?.user.name?.split(' ')[0] ?? 'You';
  const callerInitials = session?.user.name
    ? initialsOf(session.user.name)
    : 'YM';

  const transferMutation = useTransferOwnership(slug, {
    onSuccess: () => {
      // workspace role flips Owner→Admin so the workspace detail must refresh
      void queryClient.invalidateQueries({
        queryKey: workspaceKeys.detail(slug),
      });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
      showToast({
        status: 'success',
        title: 'Ownership transferred',
        description: `${member.name} is now the Workspace Owner. You are now an Admin.`,
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

  const confirm = () => {
    if (busy) return;
    transferMutation.mutate({ targetMemberId: member.id });
  };

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
        {/* Head row — warning tile + title/subtitle */}
        <div className="flex w-full items-center gap-3.5">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-ds-warning/30 bg-ds-warning-soft"
          >
            <Shield className="size-[22px] text-ds-warning" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DialogPrimitive.Title className="text-[17px] font-bold leading-none tracking-[-0.4px] text-foreground">
              Transfer workspace ownership?
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-ds-warning">
              Owner only
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
          You’ll become an Admin and the selected person will become the new
          Workspace Owner.
        </p>

        {/* Who group — target member (pre-selected from details dialog) */}
        <div className="flex w-full flex-col gap-2">
          <span className="text-[11px] font-semibold text-foreground">
            Transfer ownership to
          </span>
          <div className="flex h-11 w-full items-center gap-2.5 rounded-[10px] border border-ds-border bg-ds-surface px-3">
            {member.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.image}
                alt=""
                className="size-7 shrink-0 rounded-full border object-cover"
              />
            ) : (
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-ds-info/30 bg-ds-info-soft font-mono text-xs font-bold text-ds-info">
                {initialsOf(member.name)}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
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
            </span>
          </div>
        </div>

        {/* Swap preview — You → Admin / Recipient → Owner */}
        <div className="flex w-full items-center gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-ds-border bg-ds-bg px-3 py-2.5">
            {session?.user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt=""
                className="size-7 shrink-0 rounded-full border border-ds-border object-cover"
              />
            ) : (
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-ds-border bg-ds-surface font-mono text-[11px] font-bold text-foreground">
                {callerInitials}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-xs font-semibold text-foreground">
                You — {callerName}
              </span>
              <span className="font-mono text-[10px] font-semibold tracking-[0.4px] text-muted-foreground">
                Owner → Admin
              </span>
            </span>
          </div>

          <ArrowRightLeft
            className="size-[18px] shrink-0 text-ds-brand"
            aria-hidden
          />

          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-ds-brand/40 bg-ds-brand-soft px-3 py-2.5">
            {member.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.image}
                alt=""
                className="size-7 shrink-0 rounded-full border border-ds-brand/40 object-cover"
              />
            ) : (
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-ds-brand/40 bg-ds-surface font-mono text-[11px] font-bold text-ds-brand">
                {initialsOf(member.name)}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-xs font-semibold text-foreground">
                {member.name}
              </span>
              <span className="font-mono text-[10px] font-bold tracking-[0.4px] text-ds-brand">
                {member.role === 'ADMIN' ? 'Admin' : 'Member'} → Owner
              </span>
            </span>
          </div>
        </div>

        {/* Warning note */}
        <div className="flex w-full items-center gap-2 rounded-lg border border-ds-warning/30 bg-ds-warning-soft px-3 py-2.5">
          <ShieldAlert
            className="size-[13px] shrink-0 text-ds-warning"
            aria-hidden
          />
          <p className="text-[11px] leading-[1.5] text-foreground">
            This is immediate and cannot be undone without the new Owner’s
            cooperation.
          </p>
        </div>

        {/* Footer — Cancel / Transfer ownership */}
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
            onClick={confirm}
            disabled={busy}
            className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <ArrowRight className="size-4" aria-hidden />
            )}
            {busy ? 'Transferring…' : 'Transfer ownership'}
          </Button>
        </div>
      </DialogPrimitive.Content>
    </>
  );
}
