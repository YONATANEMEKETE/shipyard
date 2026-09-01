import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceMemberCard } from '@shipyard/shared';

const mockShowToast = vi.fn();
const mockMutate = vi.fn();
const mockOnOpenChange = vi.fn();

let mockIsPending = false;
let mockTransferOptions:
  | {
      onSuccess?: (data: unknown) => void;
      onError?: (error: Error) => void;
    }
  | undefined;

let mockSessionData: {
  user: { id: string; name: string; email: string; image: string | null };
  session: { id: string };
} = {
  user: {
    id: 'usr_1',
    name: 'Yonatane Mekete',
    email: 'yonatane@harbor.test',
    image: null,
  },
  session: { id: 'sess_1' },
};

vi.mock('@/components/providers/toast-provider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/use-members', () => ({
  useTransferOwnership: (_slug: string, options: unknown) => {
    mockTransferOptions = options as typeof mockTransferOptions;
    return { mutate: mockMutate, isPending: mockIsPending };
  },
}));

vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({ data: mockSessionData }),
}));

import { TransferOwnershipDialog } from '@/components/members/transfer-ownership-dialog';

function member(
  role: 'MEMBER' | 'ADMIN',
  overrides: Partial<WorkspaceMemberCard> = {},
): WorkspaceMemberCard {
  return {
    id: 'cm0mem0001',
    userId: 'usr_2',
    workspaceId: 'ws_1',
    name: 'Alex Rivera',
    email: 'alex@harbor.test',
    image: null,
    role,
    createdAt: '2026-08-14T09:00:00.000Z',
    ...overrides,
  };
}

function renderDialog(target: WorkspaceMemberCard) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TransferOwnershipDialog member={target} slug="harbor" open onOpenChange={mockOnOpenChange} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockShowToast.mockClear();
  mockMutate.mockClear();
  mockOnOpenChange.mockClear();
  mockIsPending = false;
  mockTransferOptions = undefined;
  mockSessionData = {
    user: {
      id: 'usr_1',
      name: 'Yonatane Mekete',
      email: 'yonatane@harbor.test',
      image: null,
    },
    session: { id: 'sess_1' },
  };
});

describe('TransferOwnershipDialog — owner swap confirmation', () => {
  it('renders title, body and pre-selected target Member', () => {
    renderDialog(member('MEMBER'));

    expect(screen.getByText('Transfer workspace ownership?')).toBeInTheDocument();
    expect(screen.getByText(/you’ll become an admin/i)).toBeInTheDocument();
    expect(screen.getByText('Transfer ownership to')).toBeInTheDocument();
    expect(screen.getAllByText('Alex Rivera').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/alex@harbor.test.*member/i)).toBeInTheDocument();
    expect(screen.getByText('Owner → Admin')).toBeInTheDocument();
    expect(screen.getByText('Member → Owner')).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  it('Admin target shows Admin → Owner in recipient card', () => {
    renderDialog(member('ADMIN'));

    expect(screen.getByText('Admin → Owner')).toBeInTheDocument();
    expect(screen.getByText(/alex@harbor.test.*admin/i)).toBeInTheDocument();
  });

  it('shows initials when no avatar image', () => {
    renderDialog(member('MEMBER', { image: null }));
    // swap preview fallback initials: YM for caller, AR for recipient
    expect(screen.getByText('YM')).toBeInTheDocument();
    expect(screen.getAllByText('AR').length).toBeGreaterThanOrEqual(1);
  });

  it('renders avatar images when present on tiny swap cards', () => {
    mockSessionData.user.image = 'https://example.com/yonatane.jpg';
    const withImages = member('MEMBER', { image: 'https://example.com/alex.jpg' });
    renderDialog(withImages);
    const imgs = document.body.querySelectorAll('img');
    // Who group + two swap cards = at least 2 images (target in Who + You + Recipient share same src)
    expect(imgs.length).toBeGreaterThanOrEqual(2);
    expect(document.body.querySelector('img[src="https://example.com/alex.jpg"]')).not.toBeNull();
    expect(document.body.querySelector('img[src="https://example.com/yonatane.jpg"]')).not.toBeNull();
  });

  it('You card shows caller name from session', () => {
    renderDialog(member('MEMBER'));
    expect(screen.getByText(/you — yonatane/i)).toBeInTheDocument();
  });

  it('confirm posts targetMemberId and closes with success toast', async () => {
    const user = userEvent.setup();
    renderDialog(member('MEMBER'));

    await user.click(screen.getByRole('button', { name: /transfer ownership/i }));

    expect(mockMutate).toHaveBeenCalledWith({ targetMemberId: 'cm0mem0001' });

    mockTransferOptions?.onSuccess?.({ members: [] } as unknown);
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'success',
      title: 'Ownership transferred',
      description: 'Alex Rivera is now the Workspace Owner. You are now an Admin.',
    });
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('surfaces a failure toast and stays open', async () => {
    const user = userEvent.setup();
    renderDialog(member('ADMIN'));

    await user.click(screen.getByRole('button', { name: /transfer ownership/i }));
    expect(mockMutate).toHaveBeenCalledWith({ targetMemberId: 'cm0mem0001' });

    mockTransferOptions?.onError?.(new Error('Cannot transfer to yourself'));
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'error',
      title: 'Failed to transfer ownership',
      description: 'Cannot transfer to yourself',
    });
    expect(mockOnOpenChange).not.toHaveBeenCalled();
  });

  it('shows pending state and disables confirm while transferring', async () => {
    mockIsPending = true;
    renderDialog(member('MEMBER'));

    const button = await screen.findByRole('button', { name: /transferring/i });
    expect(button).toBeDisabled();
  });

  it('cancel closes without mutating', async () => {
    const user = userEvent.setup();
    renderDialog(member('MEMBER'));

    await user.click(screen.getByRole('button', { name: /^cancel/i }));
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
