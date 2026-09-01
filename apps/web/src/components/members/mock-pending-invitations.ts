import type { InvitationCard } from '@shipyard/shared';

/**
 * Mock pending-invitations roster for the Pending tab — mirrors the rows on
 * "Screen / Members — Pending Invitations" in shipyard.pen (bob / carol /
 * dave as PENDING) plus one row per resolved status so the status filter and
 * the status pill variants have something to show while the tab is mock-fed.
 *
 * Replaced by `useInvitations` wiring when the tab goes live (see the design
 * subcopy: "Invitations last for 7 days..."). Until then the dates are fixed
 * so the Expires column renders the same way every reload.
 */
export const MOCK_PENDING_INVITATIONS: InvitationCard[] = [
  {
    id: 'inv_mock_bob',
    workspaceId: 'ws_mock',
    email: 'bob@harbor.test',
    role: 'MEMBER',
    status: 'PENDING',
    token: 'mock_token_bob',
    expiresAt: '2026-09-04T00:00:00.000Z',
    createdById: 'usr_owner',
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  },
  {
    id: 'inv_mock_carol',
    workspaceId: 'ws_mock',
    email: 'carol@harbor.test',
    role: 'ADMIN',
    status: 'PENDING',
    token: 'mock_token_carol',
    expiresAt: '2026-09-06T00:00:00.000Z',
    createdById: 'usr_owner',
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  },
  {
    id: 'inv_mock_dave',
    workspaceId: 'ws_mock',
    email: 'dave@harbor.test',
    role: 'MEMBER',
    status: 'PENDING',
    token: 'mock_token_dave',
    expiresAt: '2026-09-09T00:00:00.000Z',
    createdById: 'usr_admin',
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
  },
  // Resolved statuses — demo material for the Status filter + pill variants
  {
    id: 'inv_mock_erin',
    workspaceId: 'ws_mock',
    email: 'erin@harbor.test',
    role: 'ADMIN',
    status: 'ACCEPTED',
    token: 'mock_token_erin',
    expiresAt: '2026-09-01T00:00:00.000Z',
    createdById: 'usr_owner',
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-26T00:00:00.000Z',
  },
  {
    id: 'inv_mock_frank',
    workspaceId: 'ws_mock',
    email: 'frank@harbor.test',
    role: 'MEMBER',
    status: 'REVOKED',
    token: 'mock_token_frank',
    expiresAt: '2026-09-03T00:00:00.000Z',
    createdById: 'usr_owner',
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z',
  },
  {
    id: 'inv_mock_grace',
    workspaceId: 'ws_mock',
    email: 'grace@harbor.test',
    role: 'MEMBER',
    status: 'DECLINED',
    token: 'mock_token_grace',
    expiresAt: '2026-09-02T00:00:00.000Z',
    createdById: 'usr_admin',
    createdAt: '2026-08-26T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  },
  {
    id: 'inv_mock_henry',
    workspaceId: 'ws_mock',
    email: 'henry@harbor.test',
    role: 'MEMBER',
    status: 'EXPIRED',
    token: 'mock_token_henry',
    expiresAt: '2026-09-01T00:00:00.000Z',
    createdById: 'usr_admin',
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
  },
];

/** Pending-tab badge count — PENDING rows only, matching the design's tab pill. */
export const MOCK_PENDING_INVITATION_COUNT = MOCK_PENDING_INVITATIONS.filter(
  (invitation) => invitation.status === 'PENDING',
).length;
