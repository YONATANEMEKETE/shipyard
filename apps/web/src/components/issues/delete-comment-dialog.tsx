'use client';

import { Trash2, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useState } from 'react';

import type { CommentCard } from '@shipyard/shared';
import { StatefulButton } from '@/components/motion/button/stateful';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Delete Comment Confirm — one tile, one line, one destructive action. The API's
 * destructive-endpoint contract wants a literal `{ confirm: true }`
 * (api-design #5); this dialog is what makes the author mean it.
 *
 * Ownership stays server-side: the caller only opens this for the viewer's own
 * comment (a convenience, spec rule 3) and the API re-asserts authorship.
 * `onConfirm` owns the mutation and its toast; the dialog only owns the pending
 * beat and stays open when the delete fails, so the message is not lost behind
 * a closing overlay.
 */
export function DeleteCommentDialog({
  open,
  onOpenChange,
  comment,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The comment being deleted — null renders nothing (it may already be gone). */
  comment: CommentCard | null;
  onConfirm?: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);

  if (!comment) return null;

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm?.();
      onOpenChange(false);
    } catch {
      // Swallowed on purpose — the mutation's onError owns the message.
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#16151259] backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex w-[400px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-ds-border bg-ds-surface p-6 shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          <div className="flex w-full items-center gap-3">
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-lg border border-ds-danger/30 bg-ds-danger-soft"
            >
              <Trash2 className="size-5 text-ds-danger" aria-hidden />
            </span>
            <DialogPrimitive.Title className="min-w-0 flex-1 text-[15px] font-bold leading-none tracking-[-0.3px] text-foreground">
              Delete comment?
            </DialogPrimitive.Title>
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

          <DialogPrimitive.Description className="text-[13px] leading-[1.6] text-muted-foreground">
            Your comment is removed from the conversation for everyone, and any
            mentions in it stop linking. This can&rsquo;t be undone.
          </DialogPrimitive.Description>

          <div className="flex w-full items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className="h-9 gap-2 rounded-md px-4 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
            <StatefulButton
              type="button"
              size="sm"
              onClick={() => void confirm()}
              state={busy ? 'loading' : 'idle'}
              loadingText="Deleting…"
              icon={<Trash2 className="size-3.5" aria-hidden />}
              className="h-9 gap-2 rounded-md bg-destructive px-4 text-sm font-semibold text-white hover:bg-destructive/90"
            >
              Delete comment
            </StatefulButton>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
