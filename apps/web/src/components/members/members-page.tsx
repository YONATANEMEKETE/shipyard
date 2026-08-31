'use client';

import { Filter, Search, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { InviteMembersDialog } from '@/components/members/invite-members-dialog';
import { MemberDirectory } from '@/components/members/member-directory';
import { PendingInvitations } from '@/components/members/pending-invitations';
import { useMembers } from '@/hooks/use-members';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/motion/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
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
  const [search, setSearch] = useState('');

  const membersQuery = useMembers(slug);
  const { data: session } = useSession();
  const [roleFilter, setRoleFilter] = useState<string | undefined>(undefined);

  // Client-side filtering — the members API returns the full roster.
  const visibleMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (membersQuery.data?.members ?? []).filter((member) => {
      const matchesSearch =
        query === '' ||
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query);
      const matchesRole =
        roleFilter === undefined ||
        roleFilter === 'ALL' ||
        member.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [membersQuery.data, search, roleFilter]);

  const hasActiveFilters =
    search.trim() !== '' || (roleFilter !== undefined && roleFilter !== 'ALL');

  // Members who aren't Owner/Admin get the member view: no invite button,
  // no tabs — just the directory with search + role filter (shipyard.pen
  // "Screen / Members — Member View").
  const isMemberView = workspace?.role === 'MEMBER';

  const toolbar = (
    <div className="flex items-center gap-2">
      <Input
        value={search}
        onChange={setSearch}
        placeholder="Search members…"
        leftIcon={<Search className="size-[14px] text-muted-foreground" />}
        classNames={{
          field: 'h-[34px] w-[220px] rounded-lg border-ds-border bg-ds-surface',
          input: 'text-xs',
        }}
      />
      <Select value={roleFilter} onValueChange={setRoleFilter}>
        <SelectTrigger className="h-[34px] gap-1.5 border-ds-border bg-ds-surface px-3 text-xs text-muted-foreground hover:border-ds-border">
          <Filter className="size-[14px]" />
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All roles</SelectItem>
          <SelectItem value="OWNER">Owner</SelectItem>
          <SelectItem value="ADMIN">Admin</SelectItem>
          <SelectItem value="MEMBER">Member</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  const directory = (
    <MemberDirectory
      members={visibleMembers}
      loading={membersQuery.isPending}
      error={membersQuery.isError}
      onRetry={membersQuery.refetch}
      currentUserId={session?.user.id}
      emptyTitle={hasActiveFilters ? 'No members match' : undefined}
      emptyDescription={
        hasActiveFilters
          ? 'Try a different name or role — or clear the filters.'
          : undefined
      }
    />
  );

  return (
    <div className="flex h-full w-full flex-col gap-6">
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
            {isMemberView
              ? `Everyone with access to ${workspaceName}. As a Member you can view the directory and manage your own work here — invite and role management are handled by Owners and Admins.`
              : `Everyone with access to ${workspaceName}. Roles take effect immediately — projects owned by a removed member transfer automatically to the Workspace Owner.`}
          </p>
        </div>

        {!isMemberView ? (
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
        ) : null}
      </div>

      {isMemberView ? (
        <div className="flex min-h-0 flex-1 flex-col gap-5">
          {toolbar}
          {directory}
        </div>
      ) : (
        <Tabs
          defaultValue="directory"
          className="min-h-0 flex-1 flex-col gap-5"
        >
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <TabsList className="gap-2 border border-ds-border bg-ds-bg p-[3px]">
              <TabsTrigger value="directory" className="group gap-2">
                Directory
                <span className="inline-flex h-[18px] items-center rounded-full border border-ds-border bg-ds-surface px-1.5 font-mono text-[10px] font-bold leading-none text-muted-foreground transition-colors group-aria-selected:border-[#F0D9B0] group-aria-selected:bg-ds-brand-soft group-aria-selected:text-ds-brand">
                  {membersQuery.data?.members.length ?? 0}
                </span>
              </TabsTrigger>
              <TabsTrigger value="pending" className="group gap-2">
                Pending
                <span className="inline-flex h-[18px] items-center rounded-full border border-ds-border bg-ds-surface px-1.5 font-mono text-[10px] font-bold leading-none text-muted-foreground transition-colors group-aria-selected:border-[#F0D9B0] group-aria-selected:bg-ds-brand-soft group-aria-selected:text-ds-brand">
                  0
                </span>
              </TabsTrigger>
            </TabsList>

            {toolbar}
          </div>

          <TabsContent value="directory" className="min-h-0">
            {directory}
          </TabsContent>
          <TabsContent value="pending" className="min-h-0">
            <PendingInvitations />
          </TabsContent>
        </Tabs>
      )}

      <InviteMembersDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        slug={slug}
        workspaceName={workspaceName}
      />
    </div>
  );
}
