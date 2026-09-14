'use client';

import { Trash2, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import type { CycleDetail } from '@shipyard/shared';
import { Button } from '@/components/ui/button';
import { StatefulButton } from '@/components/motion/button/stateful';
import { useDeleteCycle } from '@/hooks/use-cycles';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

export interface DeleteCycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  /** The cycle being deleted. */
  cycle: CycleDetail | null;
  /** Issues that will be unassigned — the confirm states the blast radius. */
  issueCount?: number;
  /** Called after a successful delete — the parent leaves the cycle page. */
  onDeleted?: () => void;
}

/**
 * Delete Cycle Confirm — the same shell as the archive confirm, and
 * deliberately *without* a typed-name gate.
 *
 * Deletion is gated to a future Planned cycle (narrow blast radius: its issues
 * are unassigned, never deleted), so the locked decision is `{ confirm: true }`
 * rather than a typed name — the divergence from issues `confirmIdentifier` and
 * projects `confirmName` is intentional (api-design §5.1 #10). The issues are
 * unassigned in the same transaction, so the copy names the count instead.
 */
export function DeleteCycleDialog({
  open,
  onOpenChange,
  slug,
  cycle,
  issueCount,
  onDeleted,
}: DeleteCycleDialogProps) {
  const { showToast } = useToast();

  const deleteMutation = useDeleteCycle(slug, {
    onSuccess: (response) => {
      showToast({
        status: 'success',
        title: 'Cycle deleted',
        description: response.unassignedIssues
          ? `${response.unassignedIssues} issues were unassigned and kept.`
          : 'It had no issues.',
      });
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: "Couldn't delete cycle",
        description: error.message || 'Please try again.',
      });
    },
  });

  if (!cycle) return null;

  const impact =
    issueCount === undefined
      ? 'Its issues are unassigned, never deleted.'
      : issueCount === 0
        ? 'It has no issues assigned.'
        : `Its ${issueCount} ${issueCount === 1 ? 'issue' : 'issues'} will be unassigned, never deleted.`;

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
          <DialogPrimitive.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="absolute right-6 top-6 grid size-8 shrink-0 place-items-center rounded-lg border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </DialogPrimitive.Close>

          <div className="flex w-full flex-col gap-1 pr-11">
            <DialogPrimitive.Title className="text-[17px] font-bold leading-none tracking-[-0.4px] text-foreground">
              Delete cycle?
            </DialogPrimitive.Title>
            <p className="text-[12px] leading-[1.55] text-muted-foreground">
              Deleting {cycle.name} is permanent and frees its name for reuse.{' '}
              {impact}
            </p>
          </div>

          <div className="flex w-full items-center justify-end gap-2.5 pt-1">
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                disabled={deleteMutation.isPending}
                className="h-9 gap-1.5"
              >
                <X className="size-3.5" />
                Cancel
              </Button>
            </DialogPrimitive.Close>
            <StatefulButton
              type="button"
              onClick={() => deleteMutation.mutate({ cycleId: cycle.id })}
              className="h-9 gap-2 rounded-md bg-ds-danger px-4 text-sm font-semibold text-white hover:bg-ds-danger/90 disabled:opacity-50"
              state={deleteMutation.isPending ? 'loading' : 'idle'}
              loadingText="Deleting…"
              successText="Deleted"
              icon={<Trash2 className="size-4" />}
              disabled={deleteMutation.isPending}
            >
              Delete cycle
            </StatefulButton>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
