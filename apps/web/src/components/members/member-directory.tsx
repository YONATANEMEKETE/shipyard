import { MembersTable } from '@/components/members/members-table';
import { mockMembers } from '@/components/members/mock-members';

/**
 * Member directory tab content — renders the members table from mock data
 * shaped exactly like the API response. Swaps to live useMembers data
 * when wired.
 */
export function MemberDirectory() {
  return <MembersTable members={mockMembers} />;
}
