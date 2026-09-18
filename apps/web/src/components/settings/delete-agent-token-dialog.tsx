'use client';

import { Trash2, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { McpTokenCard } from '@shipyard/shared';

import { StatefulButton } from '@/components/motion/button/stateful';
import { Button } from '@/components/ui/button';
import { useDeleteAgentToken } from '@/hooks/use-agent-tokens';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

/**
 * Delete-connection dialog — same confirm shell as the revoke dialog (520px,
 * icon tile + title + subtitle, row summary, destructive primary), with one
 * difference that matters: revocation keeps the row, deletion ends it.
 *
 * Why both exist: revocation is an incident response (kill a leaked credential,
 * idempotent, the row stays as history), while deletion is housekeeping — with
 * no un-revoke in the product, the list would otherwise grow forever and a
 * member could never get a dead connection out of their way. That is the
 * distinction the copy states, in the member's terms rather than ours.
 *
 * The API requires the product's standard `{ confirm: true }` body for
 * destructive routes; this dialog is what makes the member mean it. The service
 * applies revoke's visibility rule (owner, or Owner/Admin), so a token the
 * caller may not see answers 404 exactly like an unknown id.
 *
 * A member who deletes a *live* token does not have to revoke it first: the row
 * and its hash go together, which kills the credential under the same
 * one-predicate rule as revocation (api-design §3.1). The copy says so.
 */
interface DeleteAgentTokenDialogProps {
  slug: string;
  token: McpTokenCard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Dead = cannot resolve any more, whether by revocation or by expiry. */
function isAlreadyDead(token: McpTokenCard): boolean {
  if (token.revokedAt) return true;
  return (
    token.expiresAt !== null &&
    new Date(token.expiresAt).getTime() <= Date.now()
  );
}

export function DeleteAgentTokenDialog({
  slug,
  token,
  open,
  onOpenChange,
}: DeleteAgentTokenDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Remount per open so a failed attempt never leaks into the next one. */}
        <DeleteAgentTokenDialogContent
          key={open ? 'open' : 'closed'}
          slug={slug}
          token={token}
          onOpenChange={onOpenChange}
        />
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function DeleteAgentTokenDialogContent({
  slug,
  token,
  onOpenChange,
}: {
  slug: string;
  token: McpTokenCard;
  onOpenChange: (open: boolean) => void;
}) {
  const { showToast } = useToast();
  const alreadyDead = isAlreadyDead(token);

  const remove = useDeleteAgentToken(slug, {
    onSuccess: () => {
      showToast({
        status: 'success',
        title: 'Connection deleted',
        description: `${token.label} is no longer listed.`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to delete the connection',
        description: error.message,
      });
    },
  });

  const busy = remove.isPending;

  const confirm = () => {
    if (busy) return;
    remove.mutate(token.id);
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
        <div className="flex w-full items-center gap-3.5">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-ds-danger/30 bg-ds-danger-soft"
          >
            <Trash2 className="size-[22px] text-ds-danger" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DialogPrimitive.Title className="text-[17px] font-bold leading-none tracking-[-0.4px] text-foreground">
              Delete this connection?
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-ds-danger">
              Removed for good
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:text-foreground"
            >
              <X aria-hidden className="size-4" />
            </button>
          </DialogPrimitive.Close>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-ds-border bg-ds-bg px-3 py-2.5">
          <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
            {token.label}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {token.tokenPrefix}…
          </span>
        </div>

        <p className="text-[13px] leading-[1.6] text-muted-foreground">
          {alreadyDead ? (
            <>
              It comes off your list for good. The token already does not work,
              so nothing else changes — and this can&rsquo;t be undone.
            </>
          ) : (
            <>
              The token stops working immediately and comes off your list for
              good. This can&rsquo;t be undone — a replacement is a new
              connection.
            </>
          )}
        </p>

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
            Delete connection
          </StatefulButton>
        </div>
      </DialogPrimitive.Content>
    </>
  );
}
