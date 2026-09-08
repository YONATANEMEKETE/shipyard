import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkspaceMemberCard } from '@shipyard/shared';
import { describe, expect, it, vi } from 'vitest';

import { MembersTable } from '@/components/members/members-table';

function member(
  overrides: Partial<WorkspaceMemberCard> = {},
): WorkspaceMemberCard {
  return {
    id: 'cm0mem0001',
    userId: 'usr_1',
    workspaceId: 'ws_1',
    name: 'Yonatane Mekete',
    email: 'yonatane@harbor.test',
    image: null,
    role: 'OWNER',
    createdAt: '2026-08-12T09:00:00.000Z',
    ...overrides,
  };
}

describe('MembersTable — directory states', () => {
  it('renders the roster rows with name, email, role pill and joined date', () => {
    render(
      <MembersTable
        members={[
          member(),
          member({
            id: 'cm0mem0002',
            userId: 'usr_2',
            name: 'Alex Rivera',
            email: 'alex@harbor.test',
            role: 'ADMIN',
            createdAt: '2026-08-14T09:00:00.000Z',
          }),
          member({
            id: 'cm0mem0003',
            userId: 'usr_3',
            name: 'Jordan Lee',
            email: 'jordan@harbor.test',
            role: 'MEMBER',
            createdAt: '2026-08-20T09:00:00.000Z',
          }),
        ]}
      />,
    );

    expect(screen.getByText('Yonatane Mekete')).toBeInTheDocument();
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.getByText('yonatane@harbor.test')).toBeInTheDocument();

    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    // "Member" appears twice: the column header and the Member role pill.
    expect(screen.getAllByText('Member').length).toBeGreaterThanOrEqual(2);

    const joined = new Date('2026-08-12T09:00:00.000Z').toLocaleDateString(
      'en-US',
      { month: 'short', day: 'numeric', year: 'numeric' },
    );
    expect(screen.getByText(joined)).toBeInTheDocument();

    // Column header strip is present
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Joined')).toBeInTheDocument();

    // Footer derives from the real list
    expect(screen.getByText(/showing 1–3 of 3 members/i)).toBeInTheDocument();
  });

  it('renders an image avatar when the member has one, initials otherwise', () => {
    render(
      <MembersTable
        members={[
          member({ image: 'https://cdn.example.test/avatars/yona.png' }),
          member({ id: 'cm0mem0002', userId: 'usr_2', name: 'Alex Rivera' }),
        ]}
      />,
    );

    const avatar = document.querySelector('img');
    expect(avatar).toHaveAttribute(
      'src',
      'https://cdn.example.test/avatars/yona.png',
    );
    expect(screen.getByText('AR')).toBeInTheDocument(); // initials fallback
    // Yonatane has an image, so no initials for that row
    expect(screen.queryByText('YM')).not.toBeInTheDocument();
  });

  it('marks the current user with the YOU pill', () => {
    render(
      <MembersTable
        members={[
          member(),
          member({ id: 'cm0mem0002', userId: 'usr_2', name: 'Alex Rivera' }),
        ]}
        currentUserId="usr_1"
      />,
    );

    expect(screen.getAllByText('YOU')).toHaveLength(1);
  });

  it('renders row skeletons while loading and no roster rows', () => {
    render(<MembersTable members={[]} loading />);

    expect(screen.getAllByTestId('member-row-skeleton')).toHaveLength(16);
    expect(screen.queryByText('Yonatane Mekete')).not.toBeInTheDocument();
    expect(screen.queryByText(/no members yet/i)).not.toBeInTheDocument();
  });

  it('renders the empty state when the list is empty', () => {
    render(<MembersTable members={[]} />);

    expect(screen.getByText('No members yet')).toBeInTheDocument();
    expect(screen.queryByTestId('member-row-skeleton')).not.toBeInTheDocument();
  });

  it('renders the error state with retry and calls onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(<MembersTable members={[]} error onRetry={onRetry} />);

    expect(screen.getByText(/couldn't load members/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows no retry button when onRetry is not provided', () => {
    render(<MembersTable members={[]} error />);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });
});

describe('MembersTable — client-side pagination', () => {
  function roster(count: number): WorkspaceMemberCard[] {
    return Array.from({ length: count }, (_, index) =>
      member({
        id: `cm0mem${String(index + 1).padStart(4, '0')}`,
        userId: `usr_${index + 1}`,
        name: `Member ${String(index + 1).padStart(2, '0')}`,
        email: `member${index + 1}@harbor.test`,
      }),
    );
  }

  it('renders only the first page and derives the footer range from it', () => {
    const first = render(<MembersTable members={roster(12)} pageSize={5} />);

    expect(screen.getByText('Member 01')).toBeInTheDocument();
    expect(screen.getByText('Member 05')).toBeInTheDocument();
    expect(screen.queryByText('Member 06')).not.toBeInTheDocument();
    expect(screen.getByText(/showing 1–5 of 12 members/i)).toBeInTheDocument();
    first.unmount();

    // Single page within the default page size keeps the old label shape
    render(<MembersTable members={roster(3)} />);
    expect(screen.getByText(/showing 1–3 of 3 members/i)).toBeInTheDocument();
  });

  it('navigates with previous/next and disables the bounds', async () => {
    const user = userEvent.setup();
    render(<MembersTable members={roster(12)} pageSize={5} />);

    const prev = screen.getByRole('button', { name: /previous page/i });
    const next = screen.getByRole('button', { name: /next page/i });
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();

    await user.click(next);
    expect(screen.queryByText('Member 01')).not.toBeInTheDocument();
    expect(screen.getByText('Member 06')).toBeInTheDocument();
    expect(screen.getByText(/showing 6–10 of 12 members/i)).toBeInTheDocument();
    expect(prev).toBeEnabled();

    await user.click(next);
    expect(screen.getByText('Member 12')).toBeInTheDocument();
    expect(
      screen.getByText(/showing 11–12 of 12 members/i),
    ).toBeInTheDocument();
    expect(next).toBeDisabled();

    await user.click(prev);
    expect(screen.getByText(/showing 6–10 of 12 members/i)).toBeInTheDocument();
  });

  it('jumps straight to a numbered page', async () => {
    const user = userEvent.setup();
    render(<MembersTable members={roster(12)} pageSize={5} />);

    await user.click(screen.getByRole('button', { name: /go to page 3/i }));
    expect(screen.getByText('Member 11')).toBeInTheDocument();
    expect(
      screen.getByText(/showing 11–12 of 12 members/i),
    ).toBeInTheDocument();
  });

  it('clamps back to the last page when the list shrinks', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MembersTable members={roster(12)} pageSize={5} />,
    );

    await user.click(screen.getByRole('button', { name: /go to page 3/i }));
    expect(
      screen.getByText(/showing 11–12 of 12 members/i),
    ).toBeInTheDocument();

    rerender(<MembersTable members={roster(2)} pageSize={5} />);
    expect(screen.getByText('Member 01')).toBeInTheDocument();
    expect(screen.getByText('Member 02')).toBeInTheDocument();
    expect(screen.getByText(/showing 1–2 of 2 members/i)).toBeInTheDocument();
  });
});
