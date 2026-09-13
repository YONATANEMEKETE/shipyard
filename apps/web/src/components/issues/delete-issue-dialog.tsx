'use client';

import { TextCursorInput, Trash2, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useState } from 'react';

import type { IssueDetail } from '@shipyard/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatefulButton } from '@/components/motion/button/stateful';
import { useDeleteIssue } from '@/hooks/use-issues';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

export interface DeleteIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  /** The issue being deleted — its identifier gates the confirm. */
  issue: IssueDetail | null;
  /** Called after a successful delete — the parent leaves the issue page. */
  onDeleted?: () => void;
}

/**
 * Delete Issue Confirm — same shell as Delete Project Confirm
 * (see components/projects/delete-project-dialog.tsx): title + subcopy + a
 * typed-identifier gate that arms the destructive button. Titles are
 * non-unique, so the SHIP-### identifier is the only unambiguous confirmation
 * key (spec §3.6).
 *
 * Deletes via useDeleteIssue; the confirm identifier is sent to the API, the
 * detail cache is dropped, the lists are invalidated and the parent navigates
 * away.
 */
export function DeleteIssueDialog({
  open,
  onOpenChange,
  slug,
  issue,
  onDeleted,
}: DeleteIssueDialogProps) {
  const { showToast } = useToast();
  const [confirmIdentifier, setConfirmIdentifier] = useState('');

  const deleteMutation = useDeleteIssue(slug, {
    onSuccess: (response) => {
      showToast({
        status: 'success',
        title: 'Issue deleted',
        description: `${response.identifier} was permanently removed.`,
      });
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: "Couldn't delete issue",
        description: error.message || 'Please try again.',
      });
    },
  });

  // Fresh confirm each open — clear the typed identifier.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setConfirmIdentifier('');
  }

  if (!issue) return null;

  const matchesIdentifier = confirmIdentifier.trim() === issue.identifier;
  const canSubmit = matchesIdentifier && !deleteMutation.isPending;

  const onConfirm = () => {
    if (!matchesIdentifier) return;
    deleteMutation.mutate({
      issueId: issue.id,
      body: { confirmIdentifier: confirmIdentifier.trim() },
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
              Delete issue?
            </DialogPrimitive.Title>
            <p className="text-[12px] leading-[1.55] text-muted-foreground">
              This permanently deletes {issue.identifier} — “{issue.title}”.
              This can&apos;t be undone.
            </p>
          </div>

          {/* Typed-identifier gate */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-foreground">
              Type the issue identifier to confirm
            </span>
            <Input
              value={confirmIdentifier}
              onChange={(value) => setConfirmIdentifier(value)}
              onBlur={() => {}}
              placeholder={issue.identifier}
              leftIcon={
                <TextCursorInput className="size-3.5 text-muted-foreground" />
              }
              error={
                confirmIdentifier !== '' && !matchesIdentifier
                  ? 'Identifier does not match'
                  : undefined
              }
              disabled={deleteMutation.isPending}
              classNames={{
                field: 'h-9 rounded-md border-ds-border bg-ds-surface',
                input: 'text-sm',
              }}
            />
          </div>

          {/* Footer */}
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
              onClick={onConfirm}
              className="h-9 gap-2 rounded-md bg-ds-danger px-4 text-sm font-semibold text-white hover:bg-ds-danger/90 disabled:opacity-50"
              state={deleteMutation.isPending ? 'loading' : 'idle'}
              loadingText="Deleting…"
              successText="Deleted"
              icon={<Trash2 className="size-4" />}
              disabled={!canSubmit}
            >
              Delete issue
            </StatefulButton>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
