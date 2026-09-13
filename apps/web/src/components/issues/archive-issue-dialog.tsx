'use client';

import { Archive, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import type { IssueDetail } from '@shipyard/shared';
import { Button } from '@/components/ui/button';
import { StatefulButton } from '@/components/motion/button/stateful';
import { useArchiveIssue } from '@/hooks/use-issues';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

export interface ArchiveIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  /** The issue being archived. */
  issue: IssueDetail | null;
  /** Called after a successful archive — the parent leaves the issue page. */
  onArchived?: () => void;
}

/**
 * Archive Issue Confirm — same shell as Archive Project Confirm
 * (see components/projects/archive-project-dialog.tsx): a compact 500w modal
 * with title + subcopy + X and a Cancel (Ghost) / Archive (Destructive)
 * footer.
 *
 * Archives via useArchiveIssue; the mutation refreshes the detail cache and
 * invalidates the lists (the issue leaves boards and active views), then the
 * parent navigates away.
 */
export function ArchiveIssueDialog({
  open,
  onOpenChange,
  slug,
  issue,
  onArchived,
}: ArchiveIssueDialogProps) {
  const { showToast } = useToast();

  const archiveMutation = useArchiveIssue(slug, {
    onSuccess: (archived) => {
      showToast({
        status: 'success',
        title: 'Issue archived',
        description: `${archived.identifier} is read-only until restored.`,
      });
      onOpenChange(false);
      onArchived?.();
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: "Couldn't archive issue",
        description: error.message || 'Please try again.',
      });
    },
  });

  if (!issue) return null;

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
          {/* Close — pinned to the top-right corner, outside the copy flow. */}
          <DialogPrimitive.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="absolute right-6 top-6 grid size-8 shrink-0 place-items-center rounded-lg border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </DialogPrimitive.Close>

          {/* Header */}
          <div className="flex w-full flex-col gap-1 pr-11">
            <DialogPrimitive.Title className="text-[17px] font-bold leading-none tracking-[-0.4px] text-foreground">
              Archive issue?
            </DialogPrimitive.Title>
            <p className="text-[12px] leading-[1.55] text-muted-foreground">
              Archiving makes {issue.identifier} read-only and hides it from
              active lists and boards. You can restore it from Archived; its
              status and blocked state are kept.
            </p>
          </div>

          {/* Footer */}
          <div className="flex w-full items-center justify-end gap-2.5 pt-1">
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                disabled={archiveMutation.isPending}
                className="h-9 gap-1.5"
              >
                <X className="size-3.5" />
                Cancel
              </Button>
            </DialogPrimitive.Close>
            <StatefulButton
              type="button"
              onClick={() => archiveMutation.mutate({ issueId: issue.id })}
              className="h-9 gap-2 rounded-md bg-ds-danger px-4 text-sm font-semibold text-white hover:bg-ds-danger/90 disabled:opacity-50"
              state={archiveMutation.isPending ? 'loading' : 'idle'}
              loadingText="Archiving…"
              successText="Archived"
              icon={<Archive className="size-4" />}
              disabled={archiveMutation.isPending}
            >
              Archive
            </StatefulButton>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
