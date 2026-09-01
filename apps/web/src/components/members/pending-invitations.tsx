'use client';

import { useMemo } from 'react';

import { PendingInvitationsTable } from '@/components/members/pending-invitations-table';
import { MOCK_PENDING_INVITATIONS } from '@/components/members/mock-pending-invitations';

/**
 * Pending tab content — the invitations table fed by mock rows today
 * (mock-pending-invitations.ts). The toolbar (search + status filter) lives
 * in MembersPage's "Tabs + Toolbar Row" per shipyard.pen; this component only
 * filters the roster and renders the card, mirroring MemberDirectory's shape
 * so the swap to useInvitations later touches one file.
 */
export function PendingInvitations({
  search = '',
  status,
}: {
  search?: string;
  status?: string | undefined;
}) {
  // Client-side filtering — same shape as MembersPage's directory filtering.
  const visibleInvitations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return MOCK_PENDING_INVITATIONS.filter((invitation) => {
      const matchesSearch =
        query === '' || invitation.email.toLowerCase().includes(query);
      const matchesStatus =
        status === undefined ||
        status === 'ALL' ||
        invitation.status === status;
      return matchesSearch && matchesStatus;
    });
  }, [search, status]);

  const hasActiveFilters =
    search.trim() !== '' || (status !== undefined && status !== 'ALL');

  return (
    <PendingInvitationsTable
      invitations={visibleInvitations}
      emptyTitle={hasActiveFilters ? 'No invitations match' : undefined}
      emptyDescription={
        hasActiveFilters
          ? 'Try a different email or status — or clear the filters.'
          : undefined
      }
    />
  );
}
