import type { InvitationStatus } from '@shipyard/shared';

import { cn } from '@/lib/utils';

/**
 * Invitation status pill — each status gets its own semantic color:
 * PENDING amber (awaiting action), ACCEPTED success-green (joined),
 * DECLINED danger-red (invitee refused), REVOKED neutral gray (admin
 * cancelled — informational), EXPIRED muted neutral (time ran out).
 * Color never carries the state alone — the label always does
 * (accessibility: color is never the only signal).
 */

export const INVITATION_STATUS_STYLES: Record<
  InvitationStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: 'Pending',
    className: 'border-ds-warning/30 bg-ds-warning-soft text-ds-warning',
  },
  ACCEPTED: {
    label: 'Accepted',
    className: 'border-ds-success/30 bg-ds-success-soft text-ds-success',
  },
  DECLINED: {
    label: 'Declined',
    className: 'border-ds-danger/30 bg-ds-danger-soft text-ds-danger',
  },
  REVOKED: {
    label: 'Revoked',
    className: 'border-ds-border bg-ds-surface-subtle text-muted-foreground',
  },
  EXPIRED: {
    label: 'Expired',
    className:
      'border-ds-border/70 bg-ds-surface-subtle text-muted-foreground/70',
  },
};

export interface InvitationStatusBadgeProps {
  status: InvitationStatus;
  /** Override the status's default colors for contextual variants. */
  className?: string;
}

export function InvitationStatusBadge({
  status,
  className,
}: InvitationStatusBadgeProps) {
  const style = INVITATION_STATUS_STYLES[status];

  return (
    <span
      className={cn(
        'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1.5 rounded-full border px-2.5 text-[10.5px] font-semibold',
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
