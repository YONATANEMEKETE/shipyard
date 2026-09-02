'use client';

import { UserRoundCheck, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useState } from 'react';

import type { ProjectDetail } from '@shipyard/shared';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/motion/select';
import { StatefulButton } from '@/components/motion/button/stateful';
import { useMembers } from '@/hooks/use-members';
import { useTransferProjectOwner } from '@/hooks/use-projects';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

export interface TransferProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  /** The project being re-owned — drives the current-owner readout. */
  project: ProjectDetail | null;
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/**
 * Change Ownership Dialog — mirrors Element / Change Ownership Modal (DWojQ)
 * in shipyard.pen: 500w modal, header (17/700 title + 12 muted subcopy + X),
 * CURRENT OWNER readout (avatar + name + email), a divider, SELECT A NEW
 * OWNER field (member avatar + name + chevron), footer Cancel (Ghost/X) +
 * Change owner (Primary/user-check). POSTs the membership id via
 * useTransferProjectOwner; the transfer API rejects the current owner and
 * out-of-workspace targets.
 */
export function TransferProjectDialog({
  open,
  onOpenChange,
  slug,
  project,
}: TransferProjectDialogProps) {
  const { showToast } = useToast();
  const { data: roster } = useMembers(slug);
  const [targetMemberId, setTargetMemberId] = useState<string | null>(null);

  const transferMutation = useTransferProjectOwner(slug, {
    onSuccess: (card) => {
      showToast({
        status: 'success',
        title: 'Owner changed',
        description: `${card.owner.name} now owns ${card.name}.`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: "Couldn't change owner",
        description: error.message || 'Please try again.',
      });
    },
  });

  // Fresh transfer each open — reset the selection when the dialog opens
  // (React "adjust state when a prop changes" pattern).
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setTargetMemberId(null);
  }

  // Roster minus the current owner (the API rejects re-selecting the owner).
  const candidates = (roster?.members ?? []).filter(
    (member) => member.userId !== project?.owner.userId,
  );

  if (!project) return null;

  const selectedMember =
    candidates.find((member) => member.id === targetMemberId) ?? null;
  const canSubmit = targetMemberId !== null && !transferMutation.isPending;

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!targetMemberId) return;
    transferMutation.mutate({
      projectId: project.id,
      body: { targetMemberId },
    });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#17171714] backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[500px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-2xl border border-ds-border bg-ds-surface p-6 shadow-[0_12px_28px_#17171718]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          {/* Header */}
          <div className="flex w-full items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <DialogPrimitive.Title className="text-[17px] font-bold leading-none tracking-[-0.4px] text-foreground">
                Change project owner
              </DialogPrimitive.Title>
              <p className="text-[12px] leading-[1.55] text-muted-foreground">
                Transfer ownership to a current workspace member. Their
                workspace role stays the same.
              </p>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </DialogPrimitive.Close>
          </div>

          {/* Current owner */}
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[1px] text-muted-foreground">
            Current owner
          </span>
          <div className="flex w-full items-center gap-2.5">
            {project.owner.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={project.owner.image}
                alt=""
                className="size-8 shrink-0 rounded-full border border-ds-border/60 object-cover"
              />
            ) : (
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ds-brand font-mono text-[10px] font-bold text-white">
                {initialsOf(project.owner.name)}
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[13px] font-semibold leading-none text-foreground">
                {project.owner.name}
              </span>
              <span className="truncate text-[11px] leading-none text-muted-foreground">
                {project.owner.email}
              </span>
            </div>
          </div>

          <div className="h-px w-full bg-ds-border" />

          {/* New owner */}
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[1px] text-muted-foreground">
            Select a new owner
          </span>

          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-foreground">
                New owner
              </span>
              <Select
                value={targetMemberId ?? ''}
                onValueChange={(value) => setTargetMemberId(value || null)}
              >
                <SelectTrigger className="h-9 rounded-md border-ds-border bg-ds-surface text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {selectedMember ? (
                      <>
                        {selectedMember.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selectedMember.image}
                            alt=""
                            className="size-6 shrink-0 rounded-full border border-ds-border/60 object-cover"
                          />
                        ) : (
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ds-brand font-mono text-[9px] font-bold text-white">
                            {initialsOf(selectedMember.name)}
                          </span>
                        )}
                        <span className="truncate text-xs font-medium text-foreground">
                          {selectedMember.name}
                        </span>
                      </>
                    ) : (
                      <SelectValue placeholder="Select a member" />
                    )}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {candidates.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      No other members to transfer to.
                    </p>
                  ) : (
                    candidates.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex w-full items-center justify-end gap-2.5 pt-1">
              <DialogPrimitive.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={transferMutation.isPending}
                  className="h-9 gap-1.5"
                >
                  <X className="size-3.5" />
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <StatefulButton
                type="submit"
                className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90 disabled:opacity-50"
                state={transferMutation.isPending ? 'loading' : 'idle'}
                loadingText="Changing…"
                successText="Changed"
                icon={<UserRoundCheck className="size-4" />}
                disabled={!canSubmit}
              >
                Change owner
              </StatefulButton>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
