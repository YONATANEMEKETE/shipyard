import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type {
  CreateWorkspaceRequest,
  DeleteWorkspaceRequest,
  UpdateWorkspaceRequest,
  WorkspaceCard,
  WorkspaceDetail,
} from '@shipyard/shared';

import {
  archiveWorkspace,
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  listWorkspaces,
  restoreWorkspace,
  updateWorkspace,
  WorkspaceApiError,
} from '@/lib/api/workspaces';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys — single place to keep cache keys consistent across the app.
// All workspace queries are keyed so invalidations stay precise.
// ─────────────────────────────────────────────────────────────────────────────

export const workspaceKeys = {
  all: ['workspaces'] as const,
  lists: () => [...workspaceKeys.all, 'list'] as const,
  details: () => [...workspaceKeys.all, 'detail'] as const,
  detail: (slug: string) => [...workspaceKeys.details(), slug] as const,
} as const;

// ── Queries ──

export function useWorkspaces(
  options?: Omit<
    UseQueryOptions<{ workspaces: WorkspaceCard[] }, WorkspaceApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: workspaceKeys.lists(),
    queryFn: listWorkspaces,
    ...options,
  });
}

export function useWorkspace(
  slug: string | null | undefined,
  options?: Omit<
    UseQueryOptions<WorkspaceDetail, WorkspaceApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled = Boolean(slug) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useQuery({
    queryKey: slug ? workspaceKeys.detail(slug) : workspaceKeys.details(),
    queryFn: () => getWorkspace(slug as string),
    enabled,
    ...rest,
  });
}

// ── Mutations ──

export function useCreateWorkspace(
  options?: UseMutationOptions<
    WorkspaceDetail,
    WorkspaceApiError,
    CreateWorkspaceRequest,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: createWorkspace,
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
      queryClient.setQueryData(workspaceKeys.detail(data.slug), data);
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useUpdateWorkspace(
  slug: string,
  options?: UseMutationOptions<
    WorkspaceDetail,
    WorkspaceApiError,
    UpdateWorkspaceRequest,
    { previous?: WorkspaceDetail }
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, onError, onMutate, ...rest } = options ?? {};
  return useMutation({
    mutationFn: (body: UpdateWorkspaceRequest) => updateWorkspace(slug, body),
    ...rest,
    onMutate: async (variables) => {
      const userMutate = onMutate as unknown as
        ((v: UpdateWorkspaceRequest) => unknown) | undefined;
      // allow caller onMutate to run first if provided
      const maybeContext = userMutate
        ? await (userMutate(variables) as Promise<unknown>)
        : undefined;

      await queryClient.cancelQueries({ queryKey: workspaceKeys.detail(slug) });
      const previous = queryClient.getQueryData<WorkspaceDetail>(
        workspaceKeys.detail(slug),
      );
      if (previous) {
        queryClient.setQueryData<WorkspaceDetail>(workspaceKeys.detail(slug), {
          ...previous,
          ...variables,
        } as WorkspaceDetail);
      }
      // merge caller context with our previous
      if (maybeContext && typeof maybeContext === 'object') {
        return { ...(maybeContext as object), previous } as {
          previous?: WorkspaceDetail;
        };
      }
      return { previous };
    },
    onError: (error, variables, context, mutation) => {
      const ctx = context as { previous?: WorkspaceDetail } | undefined;
      if (ctx?.previous) {
        queryClient.setQueryData(workspaceKeys.detail(slug), ctx.previous);
      }
      onError?.(error, variables, context, mutation);
    },
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(workspaceKeys.detail(slug), data);
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useArchiveWorkspace(
  slug: string,
  options?: UseMutationOptions<
    WorkspaceDetail,
    WorkspaceApiError,
    void,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: () => archiveWorkspace(slug),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(workspaceKeys.detail(slug), data);
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useRestoreWorkspace(
  slug: string,
  options?: UseMutationOptions<
    WorkspaceDetail,
    WorkspaceApiError,
    void,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: () => restoreWorkspace(slug),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(workspaceKeys.detail(slug), data);
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useDeleteWorkspace(
  slug: string,
  options?: UseMutationOptions<
    void,
    WorkspaceApiError,
    DeleteWorkspaceRequest,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: (body: DeleteWorkspaceRequest) => deleteWorkspace(slug, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.removeQueries({ queryKey: workspaceKeys.detail(slug) });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

// Re-export error type so consumers don't import from two places.
export { WorkspaceApiError };
