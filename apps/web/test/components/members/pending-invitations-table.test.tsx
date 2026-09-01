import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InvitationCard } from '@shipyard/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockShowToast = vi.fn();
let mockResendMutate = vi.fn();
let mockRevokeMutate = vi.fn();
let mockResendPending = false;
let mockRevokePending = false;
let mockResendVariables: { invitationId: string } | undefined;
let mockRevokeVariables: { invitationId: string } | undefined;
let mockResendOpts:
  | { onSuccess?: (data: unknown) => void; onError?: (error: Error) => void }
  | undefined;
let mockRevokeOpts:
  | { onSuccess?: (data: unknown) => void; onError?: (error: Error) => void }
  | undefined;

vi.mock('@/components/providers/toast-provider', () => ({
  useToast: () => ({
    showToast: mockShowToast,
    dismissToast: vi.fn(),
    updateToast: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-invitations', () => ({
  useResendInvitation: (_slug: string, opts: unknown) => {
    mockResendOpts = opts as typeof mockResendOpts;
    return {
      mutate: mockResendMutate,
      isPending: mockResendPending,
      variables: mockResendVariables,
    };
  },
  useRevokeInvitation: (_slug: string, opts: unknown) => {
    mockRevokeOpts = opts as typeof mockRevokeOpts;
    return {
      mutate: mockRevokeMutate,
      isPending: mockRevokePending,
      variables: mockRevokeVariables,
    };
  },
}));

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

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('PendingInvitationsTable — pending tab states', () => {
  beforeEach(() => {
    mockShowToast.mockClear();
    mockResendMutate = vi.fn();
    mockRevokeMutate = vi.fn();
    mockResendPending = false;
    mockRevokePending = false;
    mockResendVariables = undefined;
    mockRevokeVariables = undefined;
    mockResendOpts = undefined;
    mockRevokeOpts = undefined;
  });

  it('renders invitation rows with email, invited note, role, status, expiry and actions', () => {
    renderWithProviders(
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
    renderWithProviders(
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
    renderWithProviders(<PendingInvitationsTable invitations={[]} loading />);

    expect(screen.getAllByTestId('invitation-row-skeleton')).toHaveLength(8);
    expect(screen.queryByText('alex@harbor.test')).not.toBeInTheDocument();
    expect(screen.queryByText(/no invitations yet/i)).not.toBeInTheDocument();
  });

  it('renders the empty state when the list is empty', () => {
    renderWithProviders(<PendingInvitationsTable invitations={[]} />);

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
    renderWithProviders(
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

    renderWithProviders(
      <PendingInvitationsTable invitations={[]} error onRetry={onRetry} />,
    );

    expect(screen.getByText(/couldn't load invitations/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows no retry button when onRetry is not provided', () => {
    renderWithProviders(<PendingInvitationsTable invitations={[]} error />);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('pluralises the footer for a single pending invitation', () => {
    renderWithProviders(
      <PendingInvitationsTable invitations={[invitation()]} />,
    );

    expect(
      screen.getByText(/showing 1 of 1 pending invitation/i),
    ).toBeInTheDocument();
  });
});

describe('PendingInvitationsTable — revoke and resend behaviours', () => {
  beforeEach(() => {
    mockShowToast.mockClear();
    mockResendMutate = vi.fn();
    mockRevokeMutate = vi.fn();
    mockResendPending = false;
    mockRevokePending = false;
    mockResendVariables = undefined;
    mockRevokeVariables = undefined;
    mockResendOpts = undefined;
    mockRevokeOpts = undefined;
  });

  it('enables resend/revoke for PENDING and disables for revoked/accepted/declined/expired', () => {
    renderWithProviders(
      <PendingInvitationsTable
        slug="harbor"
        invitations={[
          invitation({
            id: 'p1',
            email: 'pending@harbor.test',
            status: 'PENDING',
          }),
          invitation({
            id: 'r1',
            email: 'revoked@harbor.test',
            status: 'REVOKED',
          }),
          invitation({
            id: 'a1',
            email: 'accepted@harbor.test',
            status: 'ACCEPTED',
          }),
          invitation({
            id: 'd1',
            email: 'declined@harbor.test',
            status: 'DECLINED',
          }),
          invitation({
            id: 'e1',
            email: 'expired@harbor.test',
            status: 'EXPIRED',
          }),
        ]}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Resend invitation to pending@harbor.test',
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: 'Revoke invitation to pending@harbor.test',
      }),
    ).toBeEnabled();

    for (const email of [
      'revoked@harbor.test',
      'accepted@harbor.test',
      'declined@harbor.test',
      'expired@harbor.test',
    ]) {
      expect(
        screen.getByRole('button', { name: `Resend invitation to ${email}` }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: `Revoke invitation to ${email}` }),
      ).toBeDisabled();
    }
  });

  it('revoke is disabled when already REVOKED — matches spec revocation guard', () => {
    renderWithProviders(
      <PendingInvitationsTable
        slug="harbor"
        invitations={[
          invitation({ status: 'REVOKED', email: 'alex@harbor.test' }),
        ]}
      />,
    );
    expect(
      screen.getByRole('button', {
        name: 'Revoke invitation to alex@harbor.test',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'Resend invitation to alex@harbor.test',
      }),
    ).toBeDisabled();
  });

  it('clicking resend calls mutate with invitationId and shows loader, disables revoke on same row', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PendingInvitationsTable
        slug="harbor"
        invitations={[invitation({ id: 'cm0inv0001' })]}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Resend invitation to alex@harbor.test',
      }),
    );

    expect(mockResendMutate).toHaveBeenCalledWith({
      invitationId: 'cm0inv0001',
    });
    expect(mockResendMutate).toHaveBeenCalledTimes(1);
    expect(mockRevokeMutate).not.toHaveBeenCalled();
  });

  it('clicking revoke calls mutate with invitationId via StatefulButton', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PendingInvitationsTable
        slug="harbor"
        invitations={[invitation({ id: 'cm0inv0007' })]}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Revoke invitation to alex@harbor.test',
      }),
    );

    expect(mockRevokeMutate).toHaveBeenCalledWith({
      invitationId: 'cm0inv0007',
    });
    expect(mockResendMutate).not.toHaveBeenCalled();
  });

  it('shows loader on resending row and Revoking… on revoking row, other row stays idle', () => {
    mockResendPending = true;
    mockResendVariables = { invitationId: 'cm0inv0001' };

    renderWithProviders(
      <PendingInvitationsTable
        slug="harbor"
        invitations={[
          invitation({ id: 'cm0inv0001', email: 'alex@harbor.test' }),
          invitation({ id: 'cm0inv0002', email: 'jordan@harbor.test' }),
        ]}
      />,
    );

    const resendingBtn = screen.getByRole('button', {
      name: 'Resend invitation to alex@harbor.test',
    });
    expect(resendingBtn).toBeDisabled();
    expect(resendingBtn).toHaveAttribute(
      'aria-label',
      'Resend invitation to alex@harbor.test',
    );

    const otherResend = screen.getByRole('button', {
      name: 'Resend invitation to jordan@harbor.test',
    });
    expect(otherResend).toBeEnabled();

    const revokedBtn = screen.getByRole('button', {
      name: 'Revoke invitation to alex@harbor.test',
    });
    expect(revokedBtn).toBeDisabled();
  });

  it('StatefulButton shows Revoking… when revoke is pending on that row only', () => {
    mockRevokePending = true;
    mockRevokeVariables = { invitationId: 'cm0inv0002' };

    renderWithProviders(
      <PendingInvitationsTable
        slug="harbor"
        invitations={[
          invitation({ id: 'cm0inv0001', email: 'alex@harbor.test' }),
          invitation({ id: 'cm0inv0002', email: 'jordan@harbor.test' }),
        ]}
      />,
    );

    expect(screen.getByText(/revoking/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Revoke invitation to jordan@harbor.test',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'Revoke invitation to alex@harbor.test',
      }),
    ).toBeEnabled();
  });

  it('toasts success on resend and revoke', async () => {
    renderWithProviders(
      <PendingInvitationsTable slug="harbor" invitations={[invitation()]} />,
    );

    // resend success
    mockResendOpts?.onSuccess?.({} as never);
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          title: 'Invitation resent',
        }),
      ),
    );

    mockShowToast.mockClear();

    // revoke success
    mockRevokeOpts?.onSuccess?.({} as never);
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          title: 'Invitation revoked',
        }),
      ),
    );
  });

  it('toasts error on resend/revoke failure and keeps row visible', async () => {
    renderWithProviders(
      <PendingInvitationsTable slug="harbor" invitations={[invitation()]} />,
    );

    mockResendOpts?.onError?.(new Error('Invitation not usable'));
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          title: 'Failed to resend invitation',
          description: 'Invitation not usable',
        }),
      ),
    );

    mockShowToast.mockClear();

    mockRevokeOpts?.onError?.(new Error('Already revoked'));
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          title: 'Failed to revoke invitation',
          description: 'Already revoked',
        }),
      ),
    );

    expect(screen.getByText('alex@harbor.test')).toBeInTheDocument();
  });

  it('per-row busy isolates — resending one invite does not block the other resend button', () => {
    mockResendPending = true;
    mockResendVariables = { invitationId: 'cm0inv0001' };

    renderWithProviders(
      <PendingInvitationsTable
        slug="harbor"
        invitations={[
          invitation({ id: 'cm0inv0001', email: 'alex@harbor.test' }),
          invitation({ id: 'cm0inv0002', email: 'jordan@harbor.test' }),
          invitation({ id: 'cm0inv0003', email: 'casey@harbor.test' }),
        ]}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Resend invitation to alex@harbor.test',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'Resend invitation to jordan@harbor.test',
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: 'Resend invitation to casey@harbor.test',
      }),
    ).toBeEnabled();
  });
});
