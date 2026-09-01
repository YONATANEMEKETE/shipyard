'use client';

import { Send, X } from 'lucide-react';
import { ChevronLeft, ChevronRight, MailPlus, RotateCw } from 'lucide-react';
import type { InvitationCard } from '@shipyard/shared';

import { InvitationStatusBadge } from '@/components/members/invitation-status-badge';
import { MemberBadge } from '@/components/members/member-badge';
import { Loader } from '@/components/motion/loader';
import { StatefulButton } from '@/components/motion/button/stateful';
import { useToast } from '@/components/providers/toast-provider';
import {
  useResendInvitation,
  useRevokeInvitation,
} from '@/hooks/use-invitations';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Pending invitations directory table — structural twin of MembersTable
 * (same card, mono column header, 48px rows, bottom fade, pagination footer).
 * Column set from "Screen / Members — Pending Invitations" in shipyard.pen:
 * Invitee (email + invited-note) · Role · Status · Expires · Actions
 * (Resend / Revoke). Consumes InvitationCard exactly as the API returns it.
 */

function formatInvited(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatExpires(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Skeleton row — mirrors InvitationRow's cell geometry so loading → data swaps without layout shift. */
function InvitationRowSkeleton() {
  return (
    <div
      aria-hidden
      data-testid="invitation-row-skeleton"
      className="flex h-12 items-center gap-3 border-b border-ds-border/70 px-4 last:border-b-0"
    >
      {/* Invitee — email + note placeholders */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="h-2.5 w-40 max-w-full animate-pulse rounded bg-ds-border/70" />
        <span className="h-2 w-24 max-w-full animate-pulse rounded bg-ds-border/40" />
      </div>

      {/* Role cell — same 92px column as MemberBadge */}
      <div className="flex w-[92px] shrink-0 items-center justify-start">
        <span className="h-5 w-[68px] animate-pulse rounded-full bg-ds-border/70" />
      </div>

      {/* Status cell — same 110px column as InvitationStatusBadge */}
      <div className="flex w-[110px] shrink-0 items-center justify-start">
        <span className="h-5 w-[68px] animate-pulse rounded-full bg-ds-border/70" />
      </div>

      {/* Expires cell — same 120px column */}
      <div className="w-[120px] shrink-0">
        <span className="block h-2.5 w-16 animate-pulse rounded bg-ds-border/40" />
      </div>

      {/* Row action spacer */}
      <span className="w-[172px] shrink-0" />
    </div>
  );
}

function InvitationRow({
  invitation,
  isResending,
  isRevoking,
  onResend,
  onRevoke,
}: {
  invitation: InvitationCard;
  isResending: boolean;
  isRevoking: boolean;
  onResend: () => void;
  onRevoke: () => void;
}) {
  const canAct = invitation.status === 'PENDING';
  const isBusy = isResending || isRevoking;

  return (
    <div className="flex h-12 items-center gap-3 border-b border-ds-border/70 px-4 transition-colors hover:bg-ds-bg last:border-b-0">
      {/* Invitee — email + invited note */}
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-[12.5px] font-semibold leading-none text-foreground">
          {invitation.email}
        </span>
        <span className="truncate text-[10.5px] leading-none text-muted-foreground">
          Invited {formatInvited(invitation.createdAt)}
        </span>
      </div>

      {/* Role column — cell keeps the width, the badge fits content */}
      <span className="flex w-[92px] shrink-0 items-center justify-start">
        <MemberBadge role={invitation.role} />
      </span>

      {/* Status column */}
      <span className="flex w-[110px] shrink-0 items-center justify-start">
        <InvitationStatusBadge status={invitation.status} />
      </span>

      {/* Expires */}
      <span className="w-[120px] shrink-0 text-[10.5px] text-muted-foreground">
        {formatExpires(invitation.expiresAt)}
      </span>

      {/* Actions — Resend / Revoke (shipyard.pen: 30px outline buttons, icon 13px).
          Fixed width matches the header's actions spacer so the Expires column
          above stays aligned with its row data. */}
      <div className="flex w-[172px] shrink-0 items-center justify-end gap-2">
        <button
          type="button"
          aria-label={`Resend invitation to ${invitation.email}`}
          disabled={!canAct || isBusy}
          onClick={onResend}
          className="flex h-[30px] items-center gap-1.5 rounded-md border border-ds-border bg-ds-surface px-3 text-[11px] font-medium text-ds-brand transition-colors hover:border-ds-brand/50 hover:bg-ds-bg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isResending ? (
            <Loader size={13} variant="spinner" label="Resending" />
          ) : (
            <Send className="size-[13px]" aria-hidden />
          )}
          Resend
        </button>
        <StatefulButton
          type="button"
          aria-label={`Revoke invitation to ${invitation.email}`}
          state={isRevoking ? 'loading' : 'idle'}
          loadingText="Revoking…"
          icon={<X className="size-[13px]" aria-hidden />}
          disabled={!canAct || isBusy}
          onClick={onRevoke}
          className="h-[30px] rounded-md border border-ds-border bg-ds-surface px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:border-ds-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          Revoke
        </StatefulButton>
      </div>
    </div>
  );
}

export function PendingInvitationsTable({
  slug = '',
  invitations,
  loading = false,
  error = false,
  onRetry,
  emptyTitle,
  emptyDescription,
}: {
  slug?: string;
  invitations: InvitationCard[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** Customize the empty state copy — e.g. "no matches" when filters are active. */
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const { showToast } = useToast();

  const resendMutation = useResendInvitation(slug, {
    onSuccess: () => {
      showToast({
        status: 'success',
        title: 'Invitation resent',
        description: 'The invite link has been resent.',
      });
    },
    onError: (err) => {
      showToast({
        status: 'error',
        title: 'Failed to resend invitation',
        description: err.message,
      });
    },
  });

  const revokeMutation = useRevokeInvitation(slug, {
    onSuccess: () => {
      showToast({
        status: 'success',
        title: 'Invitation revoked',
        description: 'The invitation has been revoked.',
      });
    },
    onError: (err) => {
      showToast({
        status: 'error',
        title: 'Failed to revoke invitation',
        description: err.message,
      });
    },
  });

  const showEmpty = !loading && !error && invitations.length === 0;
  const centered = (showEmpty || error) && !loading;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-ds-border bg-ds-surface">
      {/* Mono column header — shipyard.pen TH cells */}
      {/* Each TH is shrink-0 at the exact width of its row cell so header text
          stays aligned above its data when the table is narrower than content. */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-ds-border bg-ds-bg px-4">
        <span className="min-w-0 flex-1 font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
          Invitee
        </span>
        <span className="w-[92px] shrink-0 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
          Role
        </span>
        <span className="w-[110px] shrink-0 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
          Status
        </span>
        <span className="w-[120px] shrink-0 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
          Expires
        </span>
        <span className="w-[172px] shrink-0" />
      </div>

      {/* Rows */}
      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          centered && 'flex flex-col items-center justify-center',
        )}
      >
        {loading ? (
          Array.from({ length: 8 }, (_, index) => (
            <InvitationRowSkeleton key={index} />
          ))
        ) : error ? (
          <ErrorState
            title="Couldn't load invitations"
            description="We ran into a problem fetching the invitation list. Try again in a moment."
            action={
              onRetry ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onRetry}
                  className="h-8 gap-2 rounded-md border-ds-border bg-ds-surface px-3 text-xs font-semibold text-foreground"
                >
                  <RotateCw className="size-3.5" />
                  Try again
                </Button>
              ) : undefined
            }
          />
        ) : showEmpty ? (
          <EmptyState
            icon={MailPlus}
            title={emptyTitle ?? 'No invitations yet'}
            description={
              emptyDescription ??
              'Invite teammates to get started — pending invitations will show up here.'
            }
          />
        ) : (
          invitations.map((invitation) => {
            const isResending =
              resendMutation.isPending &&
              (resendMutation.variables as { invitationId: string } | undefined)
                ?.invitationId === invitation.id;
            const isRevoking =
              revokeMutation.isPending &&
              (revokeMutation.variables as { invitationId: string } | undefined)
                ?.invitationId === invitation.id;
            return (
              <InvitationRow
                key={invitation.id}
                invitation={invitation}
                isResending={Boolean(isResending)}
                isRevoking={Boolean(isRevoking)}
                onResend={() =>
                  resendMutation.mutate({ invitationId: invitation.id })
                }
                onRevoke={() =>
                  revokeMutation.mutate({ invitationId: invitation.id })
                }
              />
            );
          })
        )}
        {/* Bottom fade — lets the last rows dissolve into the surface before the footer */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-ds-surface to-transparent"
        />
      </div>

      {/* Pagination footer — UI only for now */}
      <div className="flex h-[52px] shrink-0 items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous page"
            className="grid size-7 place-items-center rounded-md border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-[14px]" />
          </button>
          <button
            type="button"
            className="grid size-7 place-items-center rounded-md bg-ds-brand text-xs font-semibold text-white"
          >
            1
          </button>
          <button
            type="button"
            aria-label="Next page"
            className="grid size-7 place-items-center rounded-md border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight className="size-[14px]" />
          </button>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Showing {invitations.length} of {invitations.length}{' '}
          {invitations.length === 1 ? 'pending invitation' : 'pending'}
        </span>
      </div>
    </div>
  );
}
