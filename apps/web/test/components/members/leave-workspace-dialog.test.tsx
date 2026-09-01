import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceMemberCard } from '@shipyard/shared';

const mockShowToast = vi.fn();
const mockLeaveMutate = vi.fn();
const mockTransferMutate = vi.fn();
let mockLeavePending = false;
let mockTransferPending = false;
let mockLeaveOpts: { onSuccess?: (data: unknown) => void; onError?: (error: Error) => void } | undefined;
let mockTransferOpts: { onSuccess?: (data: unknown) => void; onError?: (error: Error) => void } | undefined;
let mockMembers: WorkspaceMemberCard[] = [];
let mockSession: { user: { id: string; name: string; email: string; image: string | null } } = {
  user: { id: 'usr_owner', name: 'YONATANEM 2025', email: 'owner@harbor.test', image: null },
};

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/components/providers/toast-provider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/use-members', () => ({
  useLeaveWorkspace: (_slug: string, opts: unknown) => {
    mockLeaveOpts = opts as typeof mockLeaveOpts;
    return { mutate: mockLeaveMutate, isPending: mockLeavePending };
  },
  useTransferOwnership: (_slug: string, opts: unknown) => {
    mockTransferOpts = opts as typeof mockTransferOpts;
    return { mutate: mockTransferMutate, isPending: mockTransferPending };
  },
  useMembers: () => ({ data: { members: mockMembers } }),
}));

vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({ data: mockSession }),
}));

vi.mock('@/lib/workspace/selected-workspace', () => ({
  clearSelectedWorkspace: vi.fn(),
  getSelectedWorkspace: vi.fn(),
}));

import { LeaveWorkspaceDialog } from '@/components/members/leave-workspace-dialog';

function member(overrides: Partial<WorkspaceMemberCard> = {}): WorkspaceMemberCard {
  return {
    id: 'cm0mem0001',
    userId: 'usr_2',
    workspaceId: 'ws_1',
    name: 'Alex Rivera',
    email: 'alex@harbor.test',
    image: null,
    role: 'ADMIN',
    createdAt: '2026-08-14T09:00:00.000Z',
    ...overrides,
  };
}

function renderDialog(role: string, workspaceName = 'Harbor Labs') {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LeaveWorkspaceDialog slug="harbor" workspaceName={workspaceName} workspaceRole={role} open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockShowToast.mockClear();
  mockLeaveMutate.mockClear();
  mockTransferMutate.mockClear();
  mockPush.mockClear();
  mockLeavePending = false;
  mockTransferPending = false;
  mockLeaveOpts = undefined;
  mockTransferOpts = undefined;
  mockMembers = [
    member({ id: 'cm0owner', userId: 'usr_owner', role: 'OWNER', name: 'YONATANEM 2025', email: 'owner@harbor.test' }),
    member({ id: 'cm0admin', userId: 'usr_admin', role: 'ADMIN', name: 'Alex Rivera', email: 'alex@harbor.test' }),
    member({ id: 'cm0member', userId: 'usr_member', role: 'MEMBER', name: 'Jordan Lee', email: 'jordan@harbor.test' }),
  ];
  mockSession = { user: { id: 'usr_owner', name: 'YONATANEM 2025', email: 'owner@harbor.test', image: null } };
});

describe('LeaveWorkspaceDialog — member variant', () => {
  it('renders direct leave UI for Member', () => {
    renderDialog('MEMBER');
    expect(screen.getByText('Leave Harbor Labs?')).toBeInTheDocument();
    expect(screen.getByText(/you'll lose access to this workspace immediately/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /leave workspace/i })).toBeInTheDocument();
  });

  it('renders direct leave UI for Admin', () => {
    renderDialog('ADMIN');
    expect(screen.getByText('Leave Harbor Labs?')).toBeInTheDocument();
    expect(screen.getByText(/admin · global access/i)).toBeInTheDocument();
  });

  it('leave confirms posts and navigates on success', async () => {
    const user = userEvent.setup();
    renderDialog('MEMBER');
    await user.click(screen.getByRole('button', { name: /leave workspace/i }));
    expect(mockLeaveMutate).toHaveBeenCalled();
    mockLeaveOpts?.onSuccess?.({ transferredProjects: 0 } as unknown);
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', title: 'Left workspace' }));
    expect(mockPush).toHaveBeenCalledWith('/w');
  });

  it('leave shows pending and error', async () => {
    mockLeavePending = true;
    renderDialog('MEMBER');
    expect(await screen.findByRole('button', { name: /leaving/i })).toBeDisabled();
    // reset pending and trigger error
    mockLeavePending = false;
    renderDialog('MEMBER');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /leave workspace/i }));
    mockLeaveOpts?.onError?.(new Error('cannot leave'));
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', title: 'Failed to leave workspace' }));
  });
});

describe('LeaveWorkspaceDialog — owner variant', () => {
  it('renders transfer before leaving UI for Owner', () => {
    renderDialog('OWNER');
    expect(screen.getByText('Transfer ownership before leaving')).toBeInTheDocument();
    expect(screen.getByText(/you're the workspace owner/i)).toBeInTheDocument();
    expect(screen.getByText('Transfer ownership to')).toBeInTheDocument();
    // select should show first eligible name, not id (appears in trigger and hidden list)
    expect(screen.getAllByText(/Alex Rivera · ADMIN/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /transfer & leave/i })).toBeInTheDocument();
  });

  it('shows no eligible message when no other members', () => {
    mockMembers = [member({ id: 'cm0owner', userId: 'usr_owner', role: 'OWNER' })];
    renderDialog('OWNER');
    expect(screen.getByText(/no eligible members/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /transfer & leave/i })).toBeDisabled();
  });

  it('transfer & leave posts targetMemberId and closes on success', async () => {
    const user = userEvent.setup();
    renderDialog('OWNER');
    // default selected is first eligible (Alex Rivera)
    await user.click(screen.getByRole('button', { name: /transfer & leave/i }));
    expect(mockTransferMutate).toHaveBeenCalledWith({ targetMemberId: 'cm0admin' });
    mockTransferOpts?.onSuccess?.({} as unknown);
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', title: 'Ownership transferred' }));
  });

  it('shows transferring pending', async () => {
    mockTransferPending = true;
    renderDialog('OWNER');
    expect(await screen.findByRole('button', { name: /transferring/i })).toBeDisabled();
  });
});
