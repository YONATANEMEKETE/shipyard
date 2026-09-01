import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceMemberCard } from '@shipyard/shared';

const mockShowToast = vi.fn();
const mockMutate = vi.fn();
const mockOnOpenChange = vi.fn();

let mockIsPending = false;
let mockRemoveOptions:
  | {
      onSuccess?: (data: {
        removedMemberId: string;
        transferredProjects: number;
      }) => void;
      onError?: (error: Error) => void;
    }
  | undefined;

vi.mock('@/components/providers/toast-provider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/use-members', () => ({
  useRemoveMember: (_slug: string, options: unknown) => {
    mockRemoveOptions = options as typeof mockRemoveOptions;
    return { mutate: mockMutate, isPending: mockIsPending };
  },
}));

import { RemoveMemberDialog } from '@/components/members/remove-member-dialog';

function member(
  overrides: Partial<WorkspaceMemberCard> = {},
): WorkspaceMemberCard {
  return {
    id: 'cm0mem0001',
    userId: 'usr_2',
    workspaceId: 'ws_1',
    name: 'Alex Rivera',
    email: 'alex@harbor.test',
    image: null,
    role: 'MEMBER',
    createdAt: '2026-08-14T09:00:00.000Z',
    ...overrides,
  };
}

function renderDialog(
  target: WorkspaceMemberCard,
  workspaceName = 'Harbor Labs',
  stats?: { projectsOwned?: number },
) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <RemoveMemberDialog
        member={target}
        slug="harbor"
        workspaceName={workspaceName}
        open
        onOpenChange={mockOnOpenChange}
        stats={stats}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockShowToast.mockClear();
  mockMutate.mockClear();
  mockOnOpenChange.mockClear();
  mockIsPending = false;
  mockRemoveOptions = undefined;
});

describe('RemoveMemberDialog — danger confirmation', () => {
  it('renders title, body with workspace name and target row', () => {
    renderDialog(member());

    expect(screen.getByText('Remove member?')).toBeInTheDocument();
    expect(screen.getByText('Removes access immediately')).toBeInTheDocument();
    expect(
      screen.getByText(/will lose access to Harbor Labs immediately/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
    expect(screen.getByText(/alex@harbor.test.*member/i)).toBeInTheDocument();
    expect(
      screen.getByText(/projects will transfer to owner if any/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/ownership moves to the workspace owner/i),
    ).toBeInTheDocument();
  });

  it('shows initials when no avatar image', () => {
    renderDialog(member({ image: null }));
    expect(screen.getByText('AR')).toBeInTheDocument();
  });

  it('renders avatar image when member has image', () => {
    const withImage = member({ image: 'https://example.com/alex.jpg' });
    renderDialog(withImage);
    expect(
      document.body.querySelector('img[src="https://example.com/alex.jpg"]'),
    ).not.toBeNull();
  });

  it('transfer note shows owned project count when provided', () => {
    renderDialog(member(), 'Harbor Labs', { projectsOwned: 3 });
    expect(
      screen.getByText('3 owned projects will transfer'),
    ).toBeInTheDocument();

    // singular
    renderDialog(member(), 'Harbor Labs', { projectsOwned: 1 });
    // need to clean second render? use find, but previous portal still exists — check last call
    // at least one singular text exists
    expect(
      screen.getAllByText(/1 owned project will transfer/).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('confirm posts memberId and closes with success toast (no transfers)', async () => {
    const user = userEvent.setup();
    renderDialog(member());

    await user.click(screen.getByRole('button', { name: /^remove member$/i }));

    expect(mockMutate).toHaveBeenCalledWith({ memberId: 'cm0mem0001' });

    mockRemoveOptions?.onSuccess?.({
      removedMemberId: 'cm0mem0001',
      transferredProjects: 0,
    });
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'success',
      title: 'Member removed',
      description: 'Alex Rivera removed from Harbor Labs.',
    });
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('success toast includes transferred count when projects moved', async () => {
    const user = userEvent.setup();
    renderDialog(member());

    await user.click(screen.getByRole('button', { name: /^remove member$/i }));

    mockRemoveOptions?.onSuccess?.({
      removedMemberId: 'cm0mem0001',
      transferredProjects: 3,
    });
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'success',
      title: 'Member removed',
      description:
        'Alex Rivera removed. 3 projects transferred to the Workspace Owner.',
    });
  });

  it('surfaces failure toast and stays open', async () => {
    const user = userEvent.setup();
    renderDialog(member());

    await user.click(screen.getByRole('button', { name: /^remove member$/i }));
    expect(mockMutate).toHaveBeenCalledWith({ memberId: 'cm0mem0001' });

    mockRemoveOptions?.onError?.(new Error('Cannot remove owner'));
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'error',
      title: 'Failed to remove member',
      description: 'Cannot remove owner',
    });
    expect(mockOnOpenChange).not.toHaveBeenCalled();
  });

  it('shows pending state and disables confirm while removing', async () => {
    mockIsPending = true;
    renderDialog(member());

    const button = await screen.findByRole('button', { name: /removing/i });
    expect(button).toBeDisabled();
  });

  it('cancel closes without mutating', async () => {
    const user = userEvent.setup();
    renderDialog(member());

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
