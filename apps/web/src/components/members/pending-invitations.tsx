import { MailPlus } from 'lucide-react';

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
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <span className="grid size-11 place-items-center rounded-lg border border-ds-border bg-ds-bg">
          <MailPlus className="size-5 text-muted-foreground" />
        </span>
        <p className="text-[13px] font-semibold text-foreground">
          Pending invitations
        </p>
        <p className="max-w-[320px] text-xs leading-[1.5] text-muted-foreground">
          Invite rows (with resend / revoke) land here once wired to the API.
        </p>
      </div>
    </div>
  );
}
