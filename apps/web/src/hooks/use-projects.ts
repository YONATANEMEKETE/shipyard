import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type {
  CreateProjectRequest,
  DeleteProjectRequest,
  DeleteProjectResponse,
  ProjectCard,
  ProjectDetail,
  TransferProjectOwnerRequest,
  UpdateProjectRequest,
  ViewPreference,
  ViewScope,
  ViewType,
} from '@shipyard/shared';

import {
  archiveProject,
  createProject,
  deleteProject,
  getProject,
  getViewPreference,
  listProjects,
  ProjectsApiError,
  restoreProject,
  setViewPreference,
  transferProjectOwner,
  type ListProjectsParams,
  updateProject,
} from '@/lib/api/projects';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys — single place to keep cache keys consistent across the app.
// All project queries are keyed off the workspace slug so invalidations stay
// precise per workspace. Mirrors use-members / use-workspaces patterns.
// ─────────────────────────────────────────────────────────────────────────────

export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (slug: string, params?: ListProjectsParams) =>
    [...projectKeys.lists(), slug, params ?? {}] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (slug: string, projectId: string) =>
    [...projectKeys.details(), slug, projectId] as const,
  viewPrefs: () => [...projectKeys.all, 'view-preference'] as const,
  viewPref: (slug: string, scope: ViewScope) =>
    [...projectKeys.viewPrefs(), slug, scope] as const,
  ownedCount: (slug: string, userId: string) =>
    [...projectKeys.all, 'owned-count', slug, userId] as const,
} as const;

// ── Queries ──

export function useProjects(
  slug: string | null | undefined,
  params?: ListProjectsParams,
  options?: Omit<
    UseQueryOptions<{ projects: ProjectCard[] }, ProjectsApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled = Boolean(slug) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useQuery({
    queryKey: slug ? projectKeys.list(slug, params) : projectKeys.lists(),
    queryFn: () => listProjects(slug as string, params),
    enabled,
    ...rest,
  });
}

export function useProject(
  slug: string | null | undefined,
  projectId: string | null | undefined,
  options?: Omit<
    UseQueryOptions<ProjectDetail, ProjectsApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled =
    Boolean(slug) && Boolean(projectId) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useQuery({
    queryKey:
      slug && projectId
        ? projectKeys.detail(slug, projectId)
        : projectKeys.details(),
    queryFn: () => getProject(slug as string, projectId as string),
    enabled,
    ...rest,
  });
}

export function useViewPreference(
  slug: string | null | undefined,
  scope: ViewScope | null | undefined,
  options?: Omit<
    UseQueryOptions<ViewPreference, ProjectsApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled = Boolean(slug) && Boolean(scope) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useQuery({
    queryKey:
      slug && scope
        ? projectKeys.viewPref(slug, scope)
        : projectKeys.viewPrefs(),
    queryFn: () => getViewPreference(slug as string, scope as ViewScope),
    enabled,
    ...rest,
  });
}

/**
 * Workspace-scoped owned-project count including archived projects.
 * The projects API splits active vs archived (default excludes archived), so
 * the total inclusive is `active + archived` for that ownerId.
 * This mirrors the F3 Checkpoint B transfer which moves archived projects too
 * (spec rule 6) — the affirmation must count both.
 */
export function useOwnedProjectCount(
  slug: string | null | undefined,
  userId: string | null | undefined,
  options?: Omit<
    UseQueryOptions<number, ProjectsApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const shouldFetch =
    Boolean(slug) && Boolean(userId) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useQuery({
    queryKey:
      slug && userId ? projectKeys.ownedCount(slug, userId) : projectKeys.all,
    queryFn: async () => {
      const [active, archived] = await Promise.all([
        listProjects(slug as string, { ownerId: userId as string }),
        listProjects(slug as string, {
          ownerId: userId as string,
          archived: 'true',
        }),
      ]);
      return active.projects.length + archived.projects.length;
    },
    enabled: shouldFetch,
    ...rest,
  });
}

// ── Mutations ──

export function useCreateProject(
  slug: string,
  options?: UseMutationOptions<
    ProjectDetail,
    ProjectsApiError,
    CreateProjectRequest,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: (body) => createProject(slug, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(projectKeys.detail(slug, data.id), data);
      void queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      // owned count changes for the creator
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useUpdateProject(
  slug: string,
  options?: UseMutationOptions<
    ProjectDetail,
    ProjectsApiError,
    { projectId: string; body: UpdateProjectRequest },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ projectId, body }) => updateProject(slug, projectId, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(
        projectKeys.detail(slug, variables.projectId),
        data,
      );
      void queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useTransferProjectOwner(
  slug: string,
  options?: UseMutationOptions<
    ProjectCard,
    ProjectsApiError,
    { projectId: string; body: TransferProjectOwnerRequest },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ projectId, body }) =>
      transferProjectOwner(slug, projectId, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(
        projectKeys.detail(slug, variables.projectId),
        // detail includes owner card, but card is sufficient for cache bumping;
        // the next get detail will hydrate fully.
        data as unknown as ProjectDetail,
      );
      void queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useArchiveProject(
  slug: string,
  options?: UseMutationOptions<
    ProjectDetail,
    ProjectsApiError,
    { projectId: string },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ projectId }) => archiveProject(slug, projectId),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(
        projectKeys.detail(slug, variables.projectId),
        data,
      );
      void queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useRestoreProject(
  slug: string,
  options?: UseMutationOptions<
    ProjectDetail,
    ProjectsApiError,
    { projectId: string },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ projectId }) => restoreProject(slug, projectId),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(
        projectKeys.detail(slug, variables.projectId),
        data,
      );
      void queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useDeleteProject(
  slug: string,
  options?: UseMutationOptions<
    DeleteProjectResponse,
    ProjectsApiError,
    { projectId: string; body: DeleteProjectRequest },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ projectId, body }) => deleteProject(slug, projectId, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.removeQueries({
        queryKey: projectKeys.detail(slug, variables.projectId),
      });
      void queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useSetViewPreference(
  slug: string,
  options?: UseMutationOptions<
    ViewPreference,
    ProjectsApiError,
    { scope: ViewScope; view: ViewType },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ scope, view }) => setViewPreference(slug, scope, view),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(
        projectKeys.viewPref(slug, variables.scope),
        data,
      );
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export { ProjectsApiError };
