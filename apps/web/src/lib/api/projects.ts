import type {
  CreateProjectRequest,
  DeleteProjectRequest,
  DeleteProjectResponse,
  ProjectCard,
  ProjectDetail,
  SetViewPreferenceRequest,
  TransferProjectOwnerRequest,
  UpdateProjectRequest,
  ViewPreference,
  ViewScope,
  ViewType,
} from '@shipyard/shared';

import { confirmRequest, requestJson } from '@/lib/api/request';

// ─────────────────────────────────────────────────────────────────────────────
// Projects API client — workspace-scoped project catalogue (F4) + view
// preferences (generic, shared with Issues in F5).
// Browser → Next rewrite → internal API (ADR-003). Every request forwards the
// HttpOnly session cookie via credentials:include. Response envelopes: success
// { data }, error { error: { code, message, ... } }.
// Mirrors apps/api/src/features/projects/routes.ts and shared contracts in
// packages/shared/src/projects.
// ─────────────────────────────────────────────────────────────────────────────

export class ProjectsApiError extends Error {
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
    this.name = 'ProjectsApiError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.requestId = args.requestId;
  }
}

function projectsBase(slug: string): string {
  return `/api/v1/workspaces/${encodeURIComponent(slug)}/projects`;
}

function viewPreferencesBase(slug: string): string {
  return `/api/v1/workspaces/${encodeURIComponent(slug)}/view-preferences`;
}

// ── Projects — collection / item ───────────────────────────────────────────

export interface ListProjectsResponse {
  projects: ProjectCard[];
}

export interface ListProjectsParams {
  status?: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  ownerId?: string;
  startDate?: string;
  targetDate?: string;
  sort?: 'createdAt' | 'name' | 'targetDate' | 'startDate' | 'status';
  order?: 'asc' | 'desc';
  archived?: 'true' | 'false';
}

export function listProjects(
  slug: string,
  params?: ListProjectsParams,
): Promise<ListProjectsResponse> {
  const query = params
    ? `?${new URLSearchParams(
        Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
          if (v !== undefined && v !== null && v !== '') acc[k] = String(v);
          return acc;
        }, {}),
      ).toString()}`
    : '';
  const suffix = query === '?' ? '' : query;
  return requestJson<ListProjectsResponse>(
    `${projectsBase(slug)}${suffix}`,
    { method: 'GET' },
    'Failed to load projects',
    ProjectsApiError,
  );
}

export function getProject(
  slug: string,
  projectId: string,
): Promise<ProjectDetail> {
  return requestJson<ProjectDetail>(
    `${projectsBase(slug)}/${encodeURIComponent(projectId)}`,
    { method: 'GET' },
    'Failed to load project',
    ProjectsApiError,
  );
}

export function createProject(
  slug: string,
  body: CreateProjectRequest,
): Promise<ProjectDetail> {
  return requestJson<ProjectDetail>(
    projectsBase(slug),
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to create project',
    ProjectsApiError,
  );
}

export function updateProject(
  slug: string,
  projectId: string,
  body: UpdateProjectRequest,
): Promise<ProjectDetail> {
  return requestJson<ProjectDetail>(
    `${projectsBase(slug)}/${encodeURIComponent(projectId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'Failed to update project',
    ProjectsApiError,
  );
}

export function transferProjectOwner(
  slug: string,
  projectId: string,
  body: TransferProjectOwnerRequest,
): Promise<ProjectCard> {
  return requestJson<ProjectCard>(
    `${projectsBase(slug)}/${encodeURIComponent(projectId)}/transfer-owner`,
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to transfer project owner',
    ProjectsApiError,
  );
}

export function archiveProject(
  slug: string,
  projectId: string,
): Promise<ProjectDetail> {
  return confirmRequest<ProjectDetail>(
    `${projectsBase(slug)}/${encodeURIComponent(projectId)}/archive`,
    'Failed to archive project',
    ProjectsApiError,
  );
}

export function restoreProject(
  slug: string,
  projectId: string,
): Promise<ProjectDetail> {
  return confirmRequest<ProjectDetail>(
    `${projectsBase(slug)}/${encodeURIComponent(projectId)}/restore`,
    'Failed to restore project',
    ProjectsApiError,
  );
}

export function deleteProject(
  slug: string,
  projectId: string,
  body: DeleteProjectRequest,
): Promise<DeleteProjectResponse> {
  return requestJson<DeleteProjectResponse>(
    `${projectsBase(slug)}/${encodeURIComponent(projectId)}`,
    { method: 'DELETE', body: JSON.stringify(body) },
    'Failed to delete project',
    ProjectsApiError,
  );
}

// ── View preferences — generic, shared with Issues (F5) ───────────────────

export function getViewPreference(
  slug: string,
  scope: ViewScope,
): Promise<ViewPreference> {
  return requestJson<ViewPreference>(
    `${viewPreferencesBase(slug)}/${encodeURIComponent(scope)}`,
    { method: 'GET' },
    'Failed to load view preference',
    ProjectsApiError,
  );
}

export function setViewPreference(
  slug: string,
  scope: ViewScope,
  view: ViewType,
): Promise<ViewPreference> {
  const body: SetViewPreferenceRequest = { scope, view };
  return requestJson<ViewPreference>(
    `${viewPreferencesBase(slug)}/${encodeURIComponent(scope)}`,
    { method: 'PUT', body: JSON.stringify(body) },
    'Failed to save view preference',
    ProjectsApiError,
  );
}

export { ProjectsApiError as default };
