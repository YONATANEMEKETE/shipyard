import type {
  AttachLabelRequest,
  CreateIssueRequest,
  CreateLabelRequest,
  DeleteIssueRequest,
  DeleteIssueResponse,
  DeleteLabelResponse,
  IssueDetail,
  IssuePriority,
  IssueStatus,
  LabelCard,
  ListIssueHistoryResponse,
  ListIssuesResponse,
  UpdateIssueRequest,
  UpdateLabelRequest,
} from '@shipyard/shared';

import { confirmRequest, requestJson } from '@/lib/api/request';

// ─────────────────────────────────────────────────────────────────────────────
// Issues + Labels API client — workspace-scoped issue catalogue (F5)
//
// Browser → Next rewrite → internal API (ADR-003). Every request forwards the
// HttpOnly session cookie via credentials:include. Response envelopes: success
// { data }, error { error: { code, message, ... } }.
// Mirrors apps/api/src/features/issues/routes.ts and shared contracts in
// packages/shared/src/issues.
// ─────────────────────────────────────────────────────────────────────────────

export class IssuesApiError extends Error {
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
    this.name = 'IssuesApiError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.requestId = args.requestId;
  }
}

function issuesBase(slug: string): string {
  return `/api/v1/workspaces/${encodeURIComponent(slug)}/issues`;
}

function labelsBase(slug: string): string {
  return `/api/v1/workspaces/${encodeURIComponent(slug)}/labels`;
}

// ── Issues — list query params (mirror listIssuesQuerySchema) ────────────

export interface ListIssuesParams {
  status?: IssueStatus | IssueStatus[];
  priority?: IssuePriority | IssuePriority[];
  assigneeId?: string;
  projectId?: string;
  labels?: string[];
  blocked?: 'true' | 'false';
  cycleId?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  q?: string;
  sort?: 'createdAt' | 'updatedAt' | 'priority' | 'dueDate' | 'seqNumber';
  order?: 'asc' | 'desc';
  limit?: number;
  cursor?: string;
  archived?: 'true' | 'false';
}

function buildListQuery(params?: ListIssuesParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      // Repeatable-or-comma-separated on the API side; comma-join keeps the
      // query compact while matching multiEnum/labelsFilterSchema.
      search.set(key, value.join(','));
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

// ── Issues — collection / item ───────────────────────────────────────────

export function listIssues(
  slug: string,
  params?: ListIssuesParams,
): Promise<ListIssuesResponse> {
  return requestJson<ListIssuesResponse>(
    `${issuesBase(slug)}${buildListQuery(params)}`,
    { method: 'GET' },
    'Failed to load issues',
    IssuesApiError,
  );
}

export function getIssue(slug: string, issueId: string): Promise<IssueDetail> {
  return requestJson<IssueDetail>(
    `${issuesBase(slug)}/${encodeURIComponent(issueId)}`,
    { method: 'GET' },
    'Failed to load issue',
    IssuesApiError,
  );
}

export function listIssueHistory(
  slug: string,
  issueId: string,
  params?: { limit?: number; cursor?: string },
): Promise<ListIssueHistoryResponse> {
  return requestJson<ListIssueHistoryResponse>(
    `${issuesBase(slug)}/${encodeURIComponent(issueId)}/history${buildListQuery(params)}`,
    { method: 'GET' },
    'Failed to load issue history',
    IssuesApiError,
  );
}

export function createIssue(
  slug: string,
  body: CreateIssueRequest,
): Promise<IssueDetail> {
  return requestJson<IssueDetail>(
    issuesBase(slug),
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to create issue',
    IssuesApiError,
  );
}

export function updateIssue(
  slug: string,
  issueId: string,
  body: UpdateIssueRequest,
): Promise<IssueDetail> {
  return requestJson<IssueDetail>(
    `${issuesBase(slug)}/${encodeURIComponent(issueId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'Failed to update issue',
    IssuesApiError,
  );
}

export function archiveIssue(
  slug: string,
  issueId: string,
): Promise<IssueDetail> {
  return confirmRequest<IssueDetail>(
    `${issuesBase(slug)}/${encodeURIComponent(issueId)}/archive`,
    'Failed to archive issue',
    IssuesApiError,
  );
}

export function restoreIssue(
  slug: string,
  issueId: string,
): Promise<IssueDetail> {
  return confirmRequest<IssueDetail>(
    `${issuesBase(slug)}/${encodeURIComponent(issueId)}/restore`,
    'Failed to restore issue',
    IssuesApiError,
  );
}

export function deleteIssue(
  slug: string,
  issueId: string,
  body: DeleteIssueRequest,
): Promise<DeleteIssueResponse> {
  return requestJson<DeleteIssueResponse>(
    `${issuesBase(slug)}/${encodeURIComponent(issueId)}`,
    { method: 'DELETE', body: JSON.stringify(body) },
    'Failed to delete issue',
    IssuesApiError,
  );
}

// ── Issue labels — attach / detach (returns the updated detail) ──────────

export function attachLabel(
  slug: string,
  issueId: string,
  body: AttachLabelRequest,
): Promise<IssueDetail> {
  return requestJson<IssueDetail>(
    `${issuesBase(slug)}/${encodeURIComponent(issueId)}/labels`,
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to attach label',
    IssuesApiError,
  );
}

export function detachLabel(
  slug: string,
  issueId: string,
  labelId: string,
): Promise<IssueDetail> {
  return requestJson<IssueDetail>(
    `${issuesBase(slug)}/${encodeURIComponent(issueId)}/labels/${encodeURIComponent(labelId)}`,
    { method: 'DELETE' },
    'Failed to detach label',
    IssuesApiError,
  );
}

// ── Labels — collection / item ───────────────────────────────────────────

export interface ListLabelsResponse {
  labels: LabelCard[];
}

export function listLabels(slug: string): Promise<ListLabelsResponse> {
  return requestJson<ListLabelsResponse>(
    labelsBase(slug),
    { method: 'GET' },
    'Failed to load labels',
    IssuesApiError,
  );
}

export function createLabel(
  slug: string,
  body: CreateLabelRequest,
): Promise<LabelCard> {
  return requestJson<LabelCard>(
    labelsBase(slug),
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to create label',
    IssuesApiError,
  );
}

export function updateLabel(
  slug: string,
  labelId: string,
  body: UpdateLabelRequest,
): Promise<LabelCard> {
  return requestJson<LabelCard>(
    `${labelsBase(slug)}/${encodeURIComponent(labelId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'Failed to update label',
    IssuesApiError,
  );
}

export function deleteLabel(
  slug: string,
  labelId: string,
): Promise<DeleteLabelResponse> {
  return confirmRequest<DeleteLabelResponse>(
    `${labelsBase(slug)}/${encodeURIComponent(labelId)}`,
    'Failed to delete label',
    IssuesApiError,
  );
}

export { IssuesApiError as default };
