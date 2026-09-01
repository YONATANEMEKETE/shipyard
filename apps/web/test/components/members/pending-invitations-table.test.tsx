import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InvitationCard } from '@shipyard/shared';
import { describe, expect, it, vi } from 'vitest';

import { PendingInvitationsTable } from '@/components/members/pending-invitations-table';

function invitation(overrides: Partial<InvitationCard> = {}): InvitationCard {
  return {
    id: 'cm0inv0001',
    workspaceId: 'ws_1',
    email: 'alex@harbor.test',
    role: 'ADMIN',
    status: 'PENDING',
    token: 'tok_1',
    expiresAt: '2026-08-14T09:00:00.000Z',
    createdById: 'usr_1',
    createdAt: '2026-08-07T09:00:00.000Z',
    updatedAt: '2026-08-07T09:00:00.000Z',
    ...overrides,
  };
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

describe('PendingInvitationsTable — pending tab states', () => {
  it('renders invitation rows with email, invited note, role, status, expiry and actions', () => {
    render(
      <PendingInvitationsTable
        invitations={[
          invitation(),
          invitation({
            id: 'cm0inv0002',
            email: 'jordan@harbor.test',
            role: 'MEMBER',
            status: 'PENDING',
            createdAt: '2026-08-10T09:00:00.000Z',
            expiresAt: '2026-08-24T09:00:00.000Z',
          }),
        ]}
      />,
    );

    expect(screen.getByText('alex@harbor.test')).toBeInTheDocument();
    expect(screen.getByText('jordan@harbor.test')).toBeInTheDocument();

    // Invited note — derived from createdAt
    expect(
      screen.getByText(`Invited ${shortDate('2026-08-07T09:00:00.000Z')}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Invited ${shortDate('2026-08-10T09:00:00.000Z')}`),
    ).toBeInTheDocument();

    // Role pills
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getAllByText('Member')).toHaveLength(1);

    // Status pills
    expect(screen.getAllByText('Pending')).toHaveLength(2);

    // Expiry column
    expect(
      screen.getByText(fullDate('2026-08-14T09:00:00.000Z')),
    ).toBeInTheDocument();

    // Row actions — resend / revoke per invitee
    expect(
      screen.getByRole('button', {
        name: 'Resend invitation to alex@harbor.test',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Revoke invitation to alex@harbor.test',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Resend invitation to jordan@harbor.test',
      }),
    ).toBeInTheDocument();

    // Column header strip
    expect(screen.getByText('Invitee')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Expires')).toBeInTheDocument();

    // Footer derives from the real list
    expect(screen.getByText(/showing 2 of 2 pending/i)).toBeInTheDocument();
  });

  it('renders a distinct status pill for every resolved status', () => {
    render(
      <PendingInvitationsTable
        invitations={[
          invitation({ id: 'cm0inv0001', status: 'ACCEPTED' }),
          invitation({ id: 'cm0inv0002', status: 'REVOKED' }),
          invitation({ id: 'cm0inv0003', status: 'DECLINED' }),
          invitation({ id: 'cm0inv0004', status: 'EXPIRED' }),
        ]}
      />,
    );

    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Revoked')).toBeInTheDocument();
    expect(screen.getByText('Declined')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('renders row skeletons while loading and no invitation rows', () => {
    render(<PendingInvitationsTable invitations={[]} loading />);

    expect(screen.getAllByTestId('invitation-row-skeleton')).toHaveLength(8);
    expect(screen.queryByText('alex@harbor.test')).not.toBeInTheDocument();
    expect(screen.queryByText(/no invitations yet/i)).not.toBeInTheDocument();
  });

  it('renders the empty state when the list is empty', () => {
    render(<PendingInvitationsTable invitations={[]} />);

    expect(screen.getByText('No invitations yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Invite teammates to get started — pending invitations will show up here.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('invitation-row-skeleton'),
    ).not.toBeInTheDocument();
  });

  it('honours custom empty copy when filters are active', () => {
    render(
      <PendingInvitationsTable
        invitations={[]}
        emptyTitle="No invitations match"
        emptyDescription="Try a different email or status — or clear the filters."
      />,
    );

    expect(screen.getByText('No invitations match')).toBeInTheDocument();
    expect(
      screen.getByText(/try a different email or status/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no invitations yet/i)).not.toBeInTheDocument();
  });

  it('renders the error state with retry and calls onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <PendingInvitationsTable invitations={[]} error onRetry={onRetry} />,
    );

    expect(screen.getByText(/couldn't load invitations/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows no retry button when onRetry is not provided', () => {
    render(<PendingInvitationsTable invitations={[]} error />);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('pluralises the footer for a single pending invitation', () => {
    render(<PendingInvitationsTable invitations={[invitation()]} />);

    expect(
      screen.getByText(/showing 1 of 1 pending invitation/i),
    ).toBeInTheDocument();
  });
});
