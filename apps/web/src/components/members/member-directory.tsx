import type { WorkspaceMemberCard } from '@shipyard/shared';

import { MembersTable } from '@/components/members/members-table';

/**
 * Member directory tab content — renders the members table with live data.
 * The table resolves its own states: `loading` drives the row skeletons,
 * `error` renders the ErrorState with retry, an empty list renders the
 * EmptyState, otherwise the roster rows.
 */
export function MemberDirectory({
  members,
  loading = false,
  error = false,
  onRetry,
  currentUserId,
}: {
  members: WorkspaceMemberCard[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  currentUserId?: string;
}) {
  return (
    <MembersTable
      members={members}
      loading={loading}
      error={error}
      onRetry={onRetry}
      currentUserId={currentUserId}
    />
  );
}
