import type {
  ChangeMemberRoleRequest,
  RemoveMemberRequest,
  TransferOwnershipRequest,
  WorkspaceMemberCard,
} from '@shipyard/shared';

import { confirmRequest, requestJson } from '@/lib/api/request';

// ─────────────────────────────────────────────────────────────────────────────
// Members API client — workspace-scoped member directory and lifecycle
//
// Browser → Next rewrite → internal API (ADR-003). Every request forwards the
// HttpOnly session cookie via credentials:include. Response envelopes: success
// { data }, error { error: { code, message, ... } }.
// ─────────────────────────────────────────────────────────────────────────────

export class MembersApiError extends Error {
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
    this.name = 'MembersApiError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.requestId = args.requestId;
  }
}

function membersBase(slug: string): string {
  return `/api/v1/workspaces/${encodeURIComponent(slug)}/members`;
}

export interface ListMembersResponse {
  members: WorkspaceMemberCard[];
}

export function listMembers(slug: string): Promise<ListMembersResponse> {
  return requestJson<ListMembersResponse>(
    membersBase(slug),
    { method: 'GET' },
    'Failed to load members',
    MembersApiError,
  );
}

export function getMember(
  slug: string,
  memberId: string,
): Promise<WorkspaceMemberCard> {
  return requestJson<WorkspaceMemberCard>(
    `${membersBase(slug)}/${encodeURIComponent(memberId)}`,
    { method: 'GET' },
    'Failed to load member',
    MembersApiError,
  );
}

export function changeMemberRole(
  slug: string,
  memberId: string,
  body: ChangeMemberRoleRequest,
): Promise<WorkspaceMemberCard> {
  return requestJson<WorkspaceMemberCard>(
    `${membersBase(slug)}/${encodeURIComponent(memberId)}/role`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'Failed to change member role',
    MembersApiError,
  );
}

export interface RemoveMemberResponse {
  removedMemberId: string;
  transferredProjects: number;
}

export function removeMember(
  slug: string,
  body: RemoveMemberRequest,
): Promise<RemoveMemberResponse> {
  return requestJson<RemoveMemberResponse>(
    `${membersBase(slug)}/${encodeURIComponent(body.memberId)}/remove`,
    { method: 'POST', body: JSON.stringify({ confirm: true }) },
    'Failed to remove member',
    MembersApiError,
  );
}

export interface LeaveWorkspaceResponse {
  transferredProjects: number;
}

export function leaveWorkspace(slug: string): Promise<LeaveWorkspaceResponse> {
  return confirmRequest<LeaveWorkspaceResponse>(
    `/api/v1/workspaces/${encodeURIComponent(slug)}/leave`,
    'Failed to leave workspace',
    MembersApiError,
  );
}

export interface TransferOwnershipResponse {
  members: [WorkspaceMemberCard, WorkspaceMemberCard];
}

export function transferOwnership(
  slug: string,
  body: TransferOwnershipRequest,
): Promise<TransferOwnershipResponse> {
  return requestJson<TransferOwnershipResponse>(
    `/api/v1/workspaces/${encodeURIComponent(slug)}/transfer-ownership`,
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to transfer ownership',
    MembersApiError,
  );
}

export { MembersApiError as default };
