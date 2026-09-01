'use client';

import type { InvitationCard } from '@shipyard/shared';

import { PendingInvitationsTable } from '@/components/members/pending-invitations-table';

/**
 * Pending tab content — thin renderer mirroring MemberDirectory. The table
 * resolves its own states: `loading` drives the row skeletons, `error`
 * renders the ErrorState with retry, an empty list renders the EmptyState,
 * otherwise the invitation rows. Data + search/status filtering live in
 * MembersPage (exact mirror of the directory tab).
 */
export function PendingInvitations({
  invitations,
  loading = false,
  error = false,
  onRetry,
  emptyTitle,
  emptyDescription,
}: {
  invitations: InvitationCard[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** Customize the empty state copy — e.g. "no matches" when filters are active. */
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  return (
    <PendingInvitationsTable
      invitations={invitations}
      loading={loading}
      error={error}
      onRetry={onRetry}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
    />
  );
}
