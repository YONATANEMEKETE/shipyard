import type {
  CreateWorkspaceRequest,
  DeleteWorkspaceRequest,
  UpdateWorkspaceRequest,
  WorkspaceCard,
  WorkspaceDetail,
} from '@shipyard/shared';
import { errorResponseSchema } from '@shipyard/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Workspace API client — browser → Next rewrite → internal API (ADR-003)
// Every request forwards the HttpOnly session cookie via credentials:include.
// Response envelopes: success { data }, error { error: { code, message, ... } }
// ─────────────────────────────────────────────────────────────────────────────

const BASE = '/api/v1/workspaces';

export class WorkspaceApiError extends Error {
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
    this.name = 'WorkspaceApiError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.requestId = args.requestId;
  }
}

async function parseError(
  response: Response,
  fallbackMessage: string,
): Promise<never> {
  const status = response.status;
  let body: unknown = null;

  try {
    body = await response.json();
  } catch {
    throw new WorkspaceApiError({
      code: status === 401 ? 'UNAUTHORIZED' : 'UNKNOWN',
      message: fallbackMessage,
      status,
    });
  }

  const parsed = errorResponseSchema.safeParse(body);
  if (parsed.success) {
    const err = parsed.data.error;
    throw new WorkspaceApiError({
      code: err.code,
      message: err.message || fallbackMessage,
      status,
      details: err.details,
      requestId: err.requestId,
    });
  }

  throw new WorkspaceApiError({
    code: 'UNKNOWN',
    message: fallbackMessage,
    status,
    details: body,
  });
}

async function requestJson<T>(
  input: RequestInfo,
  init: RequestInit,
  fallbackMessage: string,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    return parseError(response, fallbackMessage) as never;
  }

  // 204 No Content — delete endpoint
  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json()) as { data: T };
  return body.data;
}

// ── Collection ──

export interface ListWorkspacesResponse {
  workspaces: WorkspaceCard[];
}

export function listWorkspaces(): Promise<ListWorkspacesResponse> {
  return requestJson<ListWorkspacesResponse>(
    BASE,
    { method: 'GET' },
    'Failed to load workspaces',
  );
}

export function createWorkspace(
  body: CreateWorkspaceRequest,
): Promise<WorkspaceDetail> {
  return requestJson<WorkspaceDetail>(
    BASE,
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to create workspace',
  );
}

// ── Item ──

export function getWorkspace(slug: string): Promise<WorkspaceDetail> {
  const encoded = encodeURIComponent(slug);
  return requestJson<WorkspaceDetail>(
    `${BASE}/${encoded}`,
    { method: 'GET' },
    'Failed to load workspace',
  );
}

export function updateWorkspace(
  slug: string,
  body: UpdateWorkspaceRequest,
): Promise<WorkspaceDetail> {
  const encoded = encodeURIComponent(slug);
  return requestJson<WorkspaceDetail>(
    `${BASE}/${encoded}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'Failed to update workspace',
  );
}

export function archiveWorkspace(slug: string): Promise<WorkspaceDetail> {
  const encoded = encodeURIComponent(slug);
  return requestJson<WorkspaceDetail>(
    `${BASE}/${encoded}/archive`,
    { method: 'POST', body: JSON.stringify({ confirm: true }) },
    'Failed to archive workspace',
  );
}

export function restoreWorkspace(slug: string): Promise<WorkspaceDetail> {
  const encoded = encodeURIComponent(slug);
  return requestJson<WorkspaceDetail>(
    `${BASE}/${encoded}/restore`,
    { method: 'POST', body: JSON.stringify({ confirm: true }) },
    'Failed to restore workspace',
  );
}

export function deleteWorkspace(
  slug: string,
  body: DeleteWorkspaceRequest,
): Promise<void> {
  const encoded = encodeURIComponent(slug);
  return requestJson<void>(
    `${BASE}/${encoded}`,
    { method: 'DELETE', body: JSON.stringify(body) },
    'Failed to delete workspace',
  );
}
