import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceMemberCard, WorkspaceRole } from '@shipyard/shared';

import { MemberDetailsDialog } from '@/components/members/member-details-dialog';

function member(
  role: WorkspaceRole,
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

function renderDetails({
  target = member('MEMBER'),
  viewerRole = 'OWNER',
  currentUserId = 'usr_1',
}: {
  target?: WorkspaceMemberCard;
  viewerRole?: WorkspaceRole;
  currentUserId?: string;
} = {}) {
  const onChangeRole = vi.fn();
  const onTransferOwnership = vi.fn();
  const onRemoveMember = vi.fn();
  const onOpenChange = vi.fn();
  const utils = render(
    <MemberDetailsDialog
      member={target}
      open
      onOpenChange={onOpenChange}
      onChangeRole={onChangeRole}
      onTransferOwnership={onTransferOwnership}
      onRemoveMember={onRemoveMember}
      workspaceName="Harbor Labs"
      viewerRole={viewerRole}
      currentUserId={currentUserId}
    />,
  );
  return {
    onChangeRole,
    onTransferOwnership,
    onRemoveMember,
    onOpenChange,
    ...utils,
  };
}

const buttons = {
  changeRole: () => screen.queryByRole('button', { name: /change role/i }),
  transfer: () => screen.queryByRole('button', { name: /transfer ownership/i }),
  remove: () => screen.queryByRole('button', { name: /remove member/i }),
};

describe('MemberDetailsDialog — permission-aware actions', () => {
  it('renders identity + definition list for any viewer', () => {
    renderDetails();

    expect(screen.getByText('Member details')).toBeInTheDocument();
    expect(screen.getByText('Harbor Labs')).toBeInTheDocument();
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
    expect(screen.getByText('alex@harbor.test')).toBeInTheDocument();
    expect(screen.getByText(/active · member since/i)).toBeInTheDocument();
    expect(screen.getByText('0 owned')).toBeInTheDocument();
    expect(screen.getAllByText('0 assigned').length).toBe(2);
  });

  it('OWNER viewer on a Member sees Change role, Transfer and Remove', () => {
    renderDetails();

    expect(buttons.changeRole()).not.toBeNull();
    expect(buttons.transfer()).not.toBeNull();
    expect(buttons.remove()).not.toBeNull();
  });

  it('OWNER viewer on an Admin sees Change role, Transfer and Remove', () => {
    renderDetails({ target: member('ADMIN') });

    expect(buttons.changeRole()).not.toBeNull();
    expect(buttons.transfer()).not.toBeNull();
    expect(buttons.remove()).not.toBeNull();
  });

  it('opening your own row shows no actions (self)', () => {
    renderDetails({ currentUserId: 'usr_2' });

    expect(buttons.changeRole()).toBeNull();
    expect(buttons.transfer()).toBeNull();
    expect(buttons.remove()).toBeNull();
    // Read-only context is still there.
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
  });

  it('ADMIN viewer on a Member sees only Remove', () => {
    renderDetails({ viewerRole: 'ADMIN' });

    expect(buttons.changeRole()).toBeNull();
    expect(buttons.transfer()).toBeNull();
    expect(buttons.remove()).not.toBeNull();
  });

  it('ADMIN viewer on an Admin sees no actions (Admin cannot remove Admin)', () => {
    renderDetails({ viewerRole: 'ADMIN', target: member('ADMIN') });

    expect(buttons.changeRole()).toBeNull();
    expect(buttons.transfer()).toBeNull();
    expect(buttons.remove()).toBeNull();
  });

  it('MEMBER viewer sees no actions (read-only)', () => {
    renderDetails({ viewerRole: 'MEMBER' });

    expect(buttons.changeRole()).toBeNull();
    expect(buttons.transfer()).toBeNull();
    expect(buttons.remove()).toBeNull();
  });

  it('Change role notifies the parent (opens the confirmation dialog)', async () => {
    const user = userEvent.setup();
    const { onChangeRole } = renderDetails();

    await user.click(buttons.changeRole()!);
    expect(onChangeRole).toHaveBeenCalledTimes(1);
  });
});
