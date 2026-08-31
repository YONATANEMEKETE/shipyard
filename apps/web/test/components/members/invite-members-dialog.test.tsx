import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockShowToast = vi.fn();
const mockMutate = vi.fn();
const mockOnOpenChange = vi.fn();

let mockIsPending = false;
let mockInviteOptions:
  | {
      onSuccess?: (data: unknown) => void;
      onError?: (error: unknown) => void;
    }
  | undefined;

vi.mock('@/components/providers/toast-provider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/use-invitations', () => ({
  useInviteMembers: (_slug: string, options: unknown) => {
    mockInviteOptions = options as typeof mockInviteOptions;
    return { mutate: mockMutate, isPending: mockIsPending };
  },
}));

vi.mock('@/hooks/use-workspaces', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-workspaces')>(
    '@/hooks/use-workspaces',
  );
  return {
    ...actual,
    useWorkspace: () => ({
      data: {
        id: '1',
        slug: 'harbor',
        name: 'Harbor Labs',
        icon: 'ship',
        status: 'ACTIVE',
        role: 'OWNER',
        memberCount: 1,
        createdAt: new Date().toISOString(),
        archivedAt: null,
      },
      isPending: false,
      isError: false,
    }),
  };
});

import { InviteMembersDialog } from '@/components/members/invite-members-dialog';
import { MembersPage } from '@/components/members/members-page';

function renderWithQC(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function renderDialog() {
  return renderWithQC(
    <InviteMembersDialog
      open
      onOpenChange={mockOnOpenChange}
      slug="harbor"
      workspaceName="Harbor Labs"
    />,
  );
}

function sendButton() {
  return screen.getByRole('button', { name: /send/i });
}

describe('Invite members flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPending = false;
    mockInviteOptions = undefined;
  });

  it('opens the dialog from the Invite members button', async () => {
    const user = userEvent.setup();
    renderWithQC(<MembersPage slug="harbor" />);

    const inviteButton = screen.getByRole('button', {
      name: /invite members/i,
    });
    await user.click(inviteButton);

    expect(
      await screen.findByRole('heading', {
        name: /invite teammates to harbor labs/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /they'll get an email with a join link valid for 7 days/i,
      ),
    ).toBeInTheDocument();
  });

  it('commits emails on Enter into chips and removes with Backspace', async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = screen.getByLabelText(/email addresses/i);
    await user.type(input, 'bob@harbor.test');
    await user.keyboard('{Enter}');
    await user.type(input, 'carol@harbor.test');
    await user.keyboard('{Enter}');

    expect(screen.getByText('bob@harbor.test')).toBeInTheDocument();
    expect(screen.getByText('carol@harbor.test')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /send 2 invitations/i }),
    ).toBeEnabled();

    await user.keyboard('{Backspace}');
    await waitFor(() =>
      expect(screen.queryByText('carol@harbor.test')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('bob@harbor.test')).toBeInTheDocument();
  });

  it('rejects an invalid email and duplicate chips with inline errors', async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = screen.getByLabelText(/email addresses/i);
    await user.type(input, 'not-an-email');
    await user.keyboard('{Enter}');
    expect(
      screen.getByText(/enter a valid email address/i),
    ).toBeInTheDocument();

    // Draft is kept on a failed commit; clear it before typing the next one.
    await user.clear(input);
    await user.type(input, 'bob@harbor.test');
    await user.keyboard('{Enter}');
    expect(screen.getByText('bob@harbor.test')).toBeInTheDocument();

    await user.type(input, 'bob@harbor.test');
    await user.keyboard('{Enter}');
    expect(
      screen.getByText(/this email is already added/i),
    ).toBeInTheDocument();
  });

  it('defaults to the Member role and lets the user pick Admin', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByRole('radio', { name: /member/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /admin/i })).not.toBeChecked();

    await user.click(screen.getByRole('radio', { name: /admin/i }));
    expect(screen.getByRole('radio', { name: /admin/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /member/i })).not.toBeChecked();
  });

  it('disables send with no emails and enables it as chips are added', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(sendButton()).toBeDisabled();

    await user.type(
      screen.getByLabelText(/email addresses/i),
      'bob@harbor.test',
    );
    await user.keyboard('{Enter}');
    expect(
      screen.getByRole('button', { name: /send 1 invitation/i }),
    ).toBeEnabled();
  });

  it('sends emails + role, then toasts success and closes on success', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(
      screen.getByLabelText(/email addresses/i),
      'bob@harbor.test',
    );
    await user.keyboard('{Enter}');
    await user.type(
      screen.getByLabelText(/email addresses/i),
      'carol@harbor.test',
    );
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('radio', { name: /admin/i }));
    await user.click(sendButton());

    expect(mockMutate).toHaveBeenCalledWith({
      emails: ['bob@harbor.test', 'carol@harbor.test'],
      role: 'ADMIN',
    });

    mockInviteOptions?.onSuccess?.({
      invitations: [{ id: 'i1' }, { id: 'i2' }],
    } as never);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          title: 'Invitations sent',
          description: '2 invitations sent.',
        }),
      );
    });
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows an error toast and keeps the dialog open on failure', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(
      screen.getByLabelText(/email addresses/i),
      'bob@harbor.test',
    );
    await user.keyboard('{Enter}');
    await user.click(sendButton());

    mockInviteOptions?.onError?.(new Error('Cannot invite yourself'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          title: 'Failed to send invitations',
          description: 'Cannot invite yourself',
        }),
      );
    });
    // Dialog stays open and chips survive for the user to fix.
    expect(
      screen.getByRole('heading', { name: /invite teammates to harbor labs/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('bob@harbor.test')).toBeInTheDocument();
    expect(mockOnOpenChange).not.toHaveBeenCalled();
  });

  it('shows the pending state on the send button while sending', async () => {
    mockIsPending = true;
    const user = userEvent.setup();
    renderDialog();

    await user.type(
      screen.getByLabelText(/email addresses/i),
      'bob@harbor.test',
    );
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
  });
});
