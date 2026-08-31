import type {
  InviteMembersRequest,
  InvitationCard,
  InvitationPreview,
  ResendInvitationRequest,
  RevokeInvitationRequest,
  WorkspaceMemberCard,
} from '@shipyard/shared';

import { confirmRequest, requestJson } from '@/lib/api/request';

// ─────────────────────────────────────────────────────────────────────────────
// Invitations API client — workspace-scoped management + token-gated accept
//
// Workspace-scoped routes live under /api/v1/workspaces/:slug/invitations.
// Token-gated routes (preview/accept/decline) live under /api/v1/invitations/:token
// and do not require workspace membership.
// ─────────────────────────────────────────────────────────────────────────────

export class InvitationsApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(args: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
    requestId?: string;
  }) {
    super(args.message);
    this.name = 'InvitationsApiError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.requestId = args.requestId;
  }
}

function invitationsBase(slug: string): string {
  return `/api/v1/workspaces/${encodeURIComponent(slug)}/invitations`;
}

// ── Workspace-scoped ──

export interface ListInvitationsResponse {
  invitations: InvitationCard[];
}

export function listInvitations(
  slug: string,
  status?: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'DECLINED' | 'EXPIRED',
): Promise<ListInvitationsResponse> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return requestJson<ListInvitationsResponse>(
    `${invitationsBase(slug)}${query}`,
    { method: 'GET' },
    'Failed to load invitations',
    InvitationsApiError,
  );
}

export interface InviteMembersResponse {
  invitations: InvitationCard[];
}

export function inviteMembers(
  slug: string,
  body: InviteMembersRequest,
): Promise<InviteMembersResponse> {
  return requestJson<InviteMembersResponse>(
    invitationsBase(slug),
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to send invitations',
    InvitationsApiError,
  );
}

export function resendInvitation(
  slug: string,
  body: ResendInvitationRequest,
): Promise<InvitationCard> {
  return confirmRequest<InvitationCard>(
    `${invitationsBase(slug)}/${encodeURIComponent(body.invitationId)}/resend`,
    'Failed to resend invitation',
    InvitationsApiError,
  );
}

export function revokeInvitation(
  slug: string,
  body: RevokeInvitationRequest,
): Promise<InvitationCard> {
  return confirmRequest<InvitationCard>(
    `${invitationsBase(slug)}/${encodeURIComponent(body.invitationId)}/revoke`,
    'Failed to revoke invitation',
    InvitationsApiError,
  );
}

// ── Token-gated ──

export function previewInvitation(token: string): Promise<InvitationPreview> {
  return requestJson<InvitationPreview>(
    `/api/v1/invitations/${encodeURIComponent(token)}`,
    { method: 'GET' },
    'Failed to load invitation',
    InvitationsApiError,
  );
}

export interface AcceptInvitationResponse {
  member: WorkspaceMemberCard;
  workspaceSlug: string;
}

export function acceptInvitation(
  token: string,
): Promise<AcceptInvitationResponse> {
  return requestJson<AcceptInvitationResponse>(
    `/api/v1/invitations/${encodeURIComponent(token)}/accept`,
    { method: 'POST', body: JSON.stringify({}) },
    'Failed to accept invitation',
    InvitationsApiError,
  );
}

export function declineInvitation(token: string): Promise<InvitationCard> {
  return requestJson<InvitationCard>(
    `/api/v1/invitations/${encodeURIComponent(token)}/decline`,
    { method: 'POST', body: JSON.stringify({}) },
    'Failed to decline invitation',
    InvitationsApiError,
  );
}

export { InvitationsApiError as default };
