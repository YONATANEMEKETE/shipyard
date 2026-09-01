import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceMemberCard } from '@shipyard/shared';

const mockShowToast = vi.fn();
const mockMutate = vi.fn();
const mockOnOpenChange = vi.fn();

let mockIsPending = false;
let mockOptions:
  | {
      onSuccess?: (data: WorkspaceMemberCard) => void;
      onError?: (error: unknown) => void;
    }
  | undefined;

vi.mock('@/components/providers/toast-provider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/use-members', () => ({
  useChangeMemberRole: (_slug: string, options: unknown) => {
    mockOptions = options as typeof mockOptions;
    return { mutate: mockMutate, isPending: mockIsPending };
  },
}));

import { ChangeRoleDialog } from '@/components/members/change-role-dialog';

function member(role: 'MEMBER' | 'ADMIN'): WorkspaceMemberCard {
  return {
    id: 'cm0mem0001',
    userId: 'usr_2',
    workspaceId: 'ws_1',
    name: 'Alex Rivera',
    email: 'alex@harbor.test',
    image: null,
    role,
    createdAt: '2026-08-14T09:00:00.000Z',
  };
}

function renderDialog(role: 'MEMBER' | 'ADMIN') {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ChangeRoleDialog
        member={member(role)}
        slug="harbor"
        open
        onOpenChange={mockOnOpenChange}
      />
    </QueryClientProvider>,
  );
}

async function confirmButton() {
  return screen.getByRole('button', { name: /confirm change/i });
}

beforeEach(() => {
  mockShowToast.mockClear();
  mockMutate.mockClear();
  mockOnOpenChange.mockClear();
  mockIsPending = false;
  mockOptions = undefined;
});

describe('ChangeRoleDialog — automatic Member ⇄ Admin switch', () => {
  it('Member target: Admin preselected and armed, Member card disabled', () => {
    renderDialog('MEMBER');

    expect(
      screen.getByText('Role change · Member → Admin'),
    ).toBeInTheDocument();

    const admin = screen.getByRole('radio', { name: /admin/i });
    const memberCard = screen.getByRole('radio', { name: /member/i });

    expect(admin).toHaveAttribute('aria-checked', 'true');
    expect(memberCard).toHaveAttribute('aria-checked', 'false');
    expect(memberCard).toBeDisabled();

    // Current-role pill + destination pill in the transition row.
    expect(screen.getAllByText('Member').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Admin').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole('button', { name: /confirm change/i }),
    ).toBeEnabled();
  });

  it('Admin target: Member preselected and armed, Admin card disabled', () => {
    renderDialog('ADMIN');

    expect(
      screen.getByText('Role change · Admin → Member'),
    ).toBeInTheDocument();

    const member = screen.getByRole('radio', { name: /member/i });
    const adminCard = screen.getByRole('radio', { name: /admin/i });

    expect(member).toHaveAttribute('aria-checked', 'true');
    expect(adminCard).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /confirm change/i }),
    ).toBeEnabled();
  });

  it('confirm posts the fixed destination role and closes with a success toast', async () => {
    const user = userEvent.setup();
    renderDialog('MEMBER');

    await user.click(await confirmButton());

    expect(mockMutate).toHaveBeenCalledWith({
      memberId: 'cm0mem0001',
      body: { role: 'ADMIN' },
    });

    // Mutation succeeds → toast + close.
    mockOptions?.onSuccess?.(member('ADMIN'));
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'success',
      title: 'Role changed',
      description: 'Alex Rivera is now admin.',
    });
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('surfaces a failure toast and stays open', async () => {
    const user = userEvent.setup();
    renderDialog('ADMIN');

    await user.click(await confirmButton());

    expect(mockMutate).toHaveBeenCalledWith({
      memberId: 'cm0mem0001',
      body: { role: 'MEMBER' },
    });

    mockOptions?.onError?.(new Error('Cannot change this role'));
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'error',
      title: 'Failed to change role',
      description: 'Cannot change this role',
    });
    expect(mockOnOpenChange).not.toHaveBeenCalled();
  });

  it('shows a pending state and disables confirm while changing', async () => {
    mockIsPending = true;
    renderDialog('MEMBER');

    const button = await screen.findByRole('button', { name: /changing/i });
    expect(button).toBeDisabled();
  });

  it('cancel closes the dialog without mutating', async () => {
    const user = userEvent.setup();
    renderDialog('MEMBER');

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
