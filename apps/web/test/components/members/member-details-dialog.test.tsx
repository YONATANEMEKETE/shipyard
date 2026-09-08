import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceMemberCard, WorkspaceRole } from '@shipyard/shared';

import { MemberDetailsDialog } from '@/components/members/member-details-dialog';
import { server } from '../../msw/server.js';

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
  slug = 'harbor',
  stats,
}: {
  target?: WorkspaceMemberCard;
  viewerRole?: WorkspaceRole;
  currentUserId?: string;
  slug?: string;
  stats?: { projectsOwned?: number; issuesAssigned?: number };
} = {}) {
  const onChangeRole = vi.fn();
  const onTransferOwnership = vi.fn();
  const onRemoveMember = vi.fn();
  const onOpenChange = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemberDetailsDialog
        member={target}
        slug={slug}
        open
        onOpenChange={onOpenChange}
        onChangeRole={onChangeRole}
        onTransferOwnership={onTransferOwnership}
        onRemoveMember={onRemoveMember}
        workspaceName="Harbor Labs"
        viewerRole={viewerRole}
        currentUserId={currentUserId}
        stats={stats}
      />
    </QueryClientProvider>,
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
  it('renders identity + definition list for any viewer (single-fetch stats)', async () => {
    renderDetails();

    expect(screen.getByText('Member details')).toBeInTheDocument();
    expect(screen.getByText('Harbor Labs')).toBeInTheDocument();
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
    expect(screen.getByText('alex@harbor.test')).toBeInTheDocument();
    expect(screen.getByText(/active · member since/i)).toBeInTheDocument();
    // Default MSW detail handler returns zeros — resolved via the bundled
    // GET /members/:memberId fetch, not separate project queries.
    expect(await screen.findByText('0 owned')).toBeInTheDocument();
    expect(await screen.findByText('0 assigned')).toBeInTheDocument();
    // Cycles row removed — cycles are team-level, no assignee.
    expect(screen.queryByText('Cycles')).toBeNull();
  });

  it('renders bundled project + issue counts from the detail endpoint', async () => {
    server.use(
      http.get('*/api/v1/workspaces/:slug/members/:memberId', () =>
        HttpResponse.json({
          data: {
            id: 'cm0mem0001',
            userId: 'usr_2',
            workspaceId: 'ws_1',
            name: 'Alex Rivera',
            email: 'alex@harbor.test',
            image: null,
            role: 'MEMBER',
            createdAt: '2026-08-14T09:00:00.000Z',
            stats: { projectsOwned: 3, issuesAssigned: 12 },
          },
        }),
      ),
    );
    renderDetails();

    expect(await screen.findByText('3 owned')).toBeInTheDocument();
    expect(await screen.findByText('12 assigned')).toBeInTheDocument();
  });

  it('shows loading spinners for stats while the detail fetch is pending', () => {
    renderDetails({ stats: undefined });

    expect(screen.getByLabelText('Loading projects count')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading issues count')).toBeInTheDocument();
  });

  it('stats override skips the detail fetch (no spinners)', async () => {
    renderDetails({ stats: { projectsOwned: 2, issuesAssigned: 5 } });

    expect(await screen.findByText('2 owned')).toBeInTheDocument();
    expect(await screen.findByText('5 assigned')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByLabelText('Loading projects count')).toBeNull();
    });
  });

  it('OWNER viewer on a Member sees Change role, Transfer and Remove', () => {
    renderDetails({ stats: { projectsOwned: 0, issuesAssigned: 0 } });

    expect(buttons.changeRole()).not.toBeNull();
    expect(buttons.transfer()).not.toBeNull();
    expect(buttons.remove()).not.toBeNull();
  });

  it('OWNER viewer on an Admin sees Change role, Transfer and Remove', () => {
    renderDetails({
      target: member('ADMIN'),
      stats: { projectsOwned: 0, issuesAssigned: 0 },
    });

    expect(buttons.changeRole()).not.toBeNull();
    expect(buttons.transfer()).not.toBeNull();
    expect(buttons.remove()).not.toBeNull();
  });

  it('opening your own row shows no actions (self)', () => {
    renderDetails({
      currentUserId: 'usr_2',
      stats: { projectsOwned: 0, issuesAssigned: 0 },
    });

    expect(buttons.changeRole()).toBeNull();
    expect(buttons.transfer()).toBeNull();
    expect(buttons.remove()).toBeNull();
    // Read-only context is still there.
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
  });

  it('ADMIN viewer on a Member sees only Remove', () => {
    renderDetails({
      viewerRole: 'ADMIN',
      stats: { projectsOwned: 0, issuesAssigned: 0 },
    });

    expect(buttons.changeRole()).toBeNull();
    expect(buttons.transfer()).toBeNull();
    expect(buttons.remove()).not.toBeNull();
  });

  it('ADMIN viewer on an Admin sees no actions (Admin cannot remove Admin)', () => {
    renderDetails({
      viewerRole: 'ADMIN',
      target: member('ADMIN'),
      stats: { projectsOwned: 0, issuesAssigned: 0 },
    });

    expect(buttons.changeRole()).toBeNull();
    expect(buttons.transfer()).toBeNull();
    expect(buttons.remove()).toBeNull();
  });

  it('MEMBER viewer sees no actions (read-only)', () => {
    renderDetails({
      viewerRole: 'MEMBER',
      stats: { projectsOwned: 0, issuesAssigned: 0 },
    });

    expect(buttons.changeRole()).toBeNull();
    expect(buttons.transfer()).toBeNull();
    expect(buttons.remove()).toBeNull();
  });

  it('Change role notifies the parent (opens the confirmation dialog)', async () => {
    const user = userEvent.setup();
    const { onChangeRole } = renderDetails({
      stats: { projectsOwned: 0, issuesAssigned: 0 },
    });

    await user.click(buttons.changeRole()!);
    expect(onChangeRole).toHaveBeenCalledTimes(1);
  });
});
