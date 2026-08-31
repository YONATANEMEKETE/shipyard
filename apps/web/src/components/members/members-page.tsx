'use client';

import { UserPlus } from 'lucide-react';
import { useState } from 'react';

import { InviteMembersDialog } from '@/components/members/invite-members-dialog';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/hooks/use-workspaces';

/**
 * Members page — the header row matches "Screen / Members — Owner · Admin"
 * in shipyard.pen: mono amber eyebrow, 28px title, muted subcopy and the
 * Invite members primary button. The tabs/toolbar row and directory card
 * land below it in the same column.
 */
export function MembersPage({ slug }: { slug: string }) {
  const { data: workspace } = useWorkspace(slug);
  const workspaceName = workspace?.name ?? 'Acme Studio';
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="flex w-full flex-col gap-6">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-ds-brand">
        Members
      </span>

      {/* Header row — title + subcopy, invite button on the right */}
      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="text-[28px] font-bold leading-none tracking-[-1px] text-foreground">
            Members
          </h1>
          <p className="text-[13px] leading-[1.5] text-muted-foreground">
            Everyone with access to {workspaceName}. Roles take effect
            immediately — projects owned by a removed member transfer
            automatically to the Workspace Owner.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90"
          >
            <UserPlus className="size-4" />
            Invite members
          </Button>
        </div>
      </div>

      {/* Tabs + toolbar row and the directory card land here next. */}

      <InviteMembersDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        workspaceName={workspaceName}
      />
    </div>
  );
}
