import type { WorkspaceMemberCard } from '@shipyard/shared';

import { MembersTable } from '@/components/members/members-table';
import { mockMembers } from '@/components/members/mock-members';

/**
 * Member directory tab content — renders the members table. Uses mock data
 * shaped exactly like the API response until useMembers is wired; `loading`
 * drives the row skeletons, an empty list renders the global EmptyState.
 */
export function MemberDirectory({
  members = mockMembers,
  loading = false,
  error = false,
  onRetry,
}: {
  members?: WorkspaceMemberCard[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <MembersTable
      members={members}
      loading={loading}
      error={error}
      onRetry={onRetry}
    />
  );
}
