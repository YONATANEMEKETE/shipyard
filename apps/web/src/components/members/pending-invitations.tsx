import { MailPlus } from 'lucide-react';

import { EmptyState } from '@/components/ui/empty-state';

/**
 * Pending invitations content — placeholder for the pending invites tab
 * (screen "Screen / Members — Pending Invitations" in shipyard.pen).
 * Wired to useInvitations next.
 */
export function PendingInvitations() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-ds-border bg-ds-surface">
      <div className="grid h-9 grid-cols-[2fr_3fr_1fr_auto] items-center gap-3 border-b border-ds-border bg-ds-bg px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
        <span>Invitee</span>
        <span>Email</span>
        <span>Role</span>
        <span>Actions</span>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <EmptyState
          icon={MailPlus}
          title="Pending invitations"
          description="Invite rows (with resend / revoke) land here once wired to the API."
        />
      </div>
    </div>
  );
}
