'use client';

import { KeyRound, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { McpTokenCard } from '@shipyard/shared';

import { Button } from '@/components/ui/button';
import { useRevokeAgentToken } from '@/hooks/use-agent-tokens';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

/**
 * Revoke-connection dialog — the same confirm shell as the member-removal
 * dialog (radix Dialog, 520px, icon tile + title + subtitle, danger primary).
 *
 * Revocation is irreversible in the product sense (a new credential is created
 * instead of un-revoking one — data-model D5), so it is confirmed; but the call
 * itself is idempotent, which is why the confirm handler needs no guard against
 * a double submit beyond the pending flag.
 *
 * Note what this dialog does **not** contain: a typed confirmation. Revoking is
 * an incident response, not a destructive edit — a member should be able to kill
 * a leaked credential in two clicks, including while the workspace is archived.
 */
interface RevokeAgentTokenDialogProps {
  slug: string;
  token: McpTokenCard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RevokeAgentTokenDialog({
  slug,
  token,
  open,
  onOpenChange,
}: RevokeAgentTokenDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <RevokeAgentTokenDialogContent
          key={open ? 'open' : 'closed'}
          slug={slug}
          token={token}
          onOpenChange={onOpenChange}
        />
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function RevokeAgentTokenDialogContent({
  slug,
  token,
  onOpenChange,
}: {
  slug: string;
  token: McpTokenCard;
  onOpenChange: (open: boolean) => void;
}) {
  const { showToast } = useToast();

  const revoke = useRevokeAgentToken(slug, {
    onSuccess: () => {
      showToast({
        status: 'success',
        title: 'Connection revoked',
        description: `${token.label} can no longer be used. You can create a new connection at any time.`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to revoke the connection',
        description: error.message,
      });
    },
  });

  const busy = revoke.isPending;

  const confirm = () => {
    if (busy) return;
    revoke.mutate(token.id);
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
            <KeyRound className="size-[22px] text-ds-danger" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DialogPrimitive.Title className="text-[17px] font-bold leading-none tracking-[-0.4px] text-foreground">
              Revoke this connection?
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-ds-danger">
              Takes effect immediately
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
          <span className="min-w-0 text-[13px] font-semibold text-foreground">
            {token.label}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {token.tokenPrefix}…
          </span>
        </div>

        <p className="text-[12px] leading-[1.5] text-muted-foreground">
          Any agent using this token loses access on its next request, and the
          token itself can never be restored — create a new connection instead.
          This does not touch any work the agent already did.
        </p>

        <div className="flex w-full items-center justify-end gap-2">
          <DialogPrimitive.Close asChild>
            <Button type="button" variant="outline" disabled={busy}>
              Cancel
            </Button>
          </DialogPrimitive.Close>
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={confirm}
            className="bg-ds-danger text-white hover:bg-ds-danger/90"
          >
            {busy ? 'Revoking…' : 'Revoke connection'}
          </Button>
        </div>
      </DialogPrimitive.Content>
    </>
  );
}
