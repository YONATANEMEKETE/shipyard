import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryOptions,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type {
  AttachLabelRequest,
  CreateIssueRequest,
  CreateLabelRequest,
  DeleteIssueRequest,
  DeleteIssueResponse,
  DeleteLabelResponse,
  IssueDetail,
  LabelCard,
  ListIssueHistoryResponse,
  ListIssuesResponse,
  UpdateIssueRequest,
  UpdateLabelRequest,
} from '@shipyard/shared';

import {
  archiveIssue,
  attachLabel,
  createIssue,
  createLabel,
  deleteIssue,
  deleteLabel,
  detachLabel,
  getIssue,
  IssuesApiError,
  listIssueHistory,
  listIssues,
  listLabels,
  restoreIssue,
  updateIssue,
  updateLabel,
  type ListIssuesParams,
} from '@/lib/api/issues';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys — single place to keep cache keys consistent across the app.
// All issue/label queries are keyed off the workspace slug so invalidations
// stay precise per workspace. Issue history is keyed under the issue detail so
// an update that touches detail invalidates the trail too. Mirrors
// use-projects / use-members patterns.
// ─────────────────────────────────────────────────────────────────────────────

export const issueKeys = {
  all: ['issues'] as const,
  lists: () => [...issueKeys.all, 'list'] as const,
  list: (slug: string, params?: ListIssuesParams) =>
    [...issueKeys.lists(), slug, params ?? {}] as const,
  details: () => [...issueKeys.all, 'detail'] as const,
  detail: (slug: string, issueId: string) =>
    [...issueKeys.details(), slug, issueId] as const,
  histories: () => [...issueKeys.all, 'history'] as const,
  history: (slug: string, issueId: string) =>
    [...issueKeys.histories(), slug, issueId] as const,
} as const;

export const labelKeys = {
  all: ['labels'] as const,
  list: (slug: string) => [...labelKeys.all, slug] as const,
} as const;

// ── Issues — queries ──

export function useIssues(
  slug: string | null | undefined,
  params?: ListIssuesParams,
  options?: Omit<
    UseQueryOptions<ListIssuesResponse, IssuesApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled = Boolean(slug) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useQuery({
    queryKey: slug ? issueKeys.list(slug, params) : issueKeys.lists(),
    queryFn: () => listIssues(slug as string, params),
    enabled,
    ...rest,
  });
}

export function useIssue(
  slug: string | null | undefined,
  issueId: string | null | undefined,
  options?: Omit<
    UseQueryOptions<IssueDetail, IssuesApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled =
    Boolean(slug) && Boolean(issueId) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useQuery({
    queryKey:
      slug && issueId ? issueKeys.detail(slug, issueId) : issueKeys.details(),
    queryFn: () => getIssue(slug as string, issueId as string),
    enabled,
    ...rest,
  });
}

/** History page size — the timeline loads the first 10, then on demand. */
export const HISTORY_PAGE_SIZE = 10;

/**
 * Issue history (#8) — cursor-paged and oldest first. This is the only reader
 * of the history key: it is deliberately an infinite query rather than a plain
 * one so the timeline and the tab count share a single cache entry instead of
 * racing two queries under the same key.
 *
 * Manual, not infinite-scroll: the panel renders the pages it already has and
 * asks for the next one only when the reader clicks.
 */
export function useInfiniteIssueHistory(
  slug: string | null | undefined,
  issueId: string | null | undefined,
  options?: Omit<
    UseInfiniteQueryOptions<
      ListIssueHistoryResponse,
      IssuesApiError,
      InfiniteData<ListIssueHistoryResponse, string | undefined>,
      readonly unknown[],
      string | undefined
    >,
    'queryKey' | 'queryFn' | 'initialPageParam' | 'getNextPageParam' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled =
    Boolean(slug) && Boolean(issueId) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useInfiniteQuery({
    queryKey:
      slug && issueId
        ? issueKeys.history(slug, issueId)
        : issueKeys.histories(),
    queryFn: ({ pageParam }) =>
      listIssueHistory(slug as string, issueId as string, {
        limit: HISTORY_PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    ...rest,
  });
}

// ── Labels — queries ──

export function useLabels(
  slug: string | null | undefined,
  options?: Omit<
    UseQueryOptions<{ labels: LabelCard[] }, IssuesApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled = Boolean(slug) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useQuery({
    queryKey: slug ? labelKeys.list(slug) : labelKeys.all,
    queryFn: () => listLabels(slug as string),
    enabled,
    ...rest,
  });
}

// ── Issues — mutations ──

export function useCreateIssue(
  slug: string,
  options?: UseMutationOptions<
    IssueDetail,
    IssuesApiError,
    CreateIssueRequest,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: (body) => createIssue(slug, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(issueKeys.detail(slug, data.id), data);
      void queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useUpdateIssue(
  slug: string,
  options?: UseMutationOptions<
    IssueDetail,
    IssuesApiError,
    { issueId: string; body: UpdateIssueRequest },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ issueId, body }) => updateIssue(slug, issueId, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(issueKeys.detail(slug, variables.issueId), data);
      void queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
      // Every PATCH can append history rows (one per changed concern), so the
      // detail page's timeline must not keep serving the pre-write page.
      void queryClient.invalidateQueries({
        queryKey: issueKeys.history(slug, variables.issueId),
      });
      // Labels live on the card; status/assignee/cycle/priority changes are
      // read on boards filtered by those values.
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useArchiveIssue(
  slug: string,
  options?: UseMutationOptions<
    IssueDetail,
    IssuesApiError,
    { issueId: string },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ issueId }) => archiveIssue(slug, issueId),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(issueKeys.detail(slug, variables.issueId), data);
      void queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
      // Archive / restore / label writes each append a history row.
      void queryClient.invalidateQueries({
        queryKey: issueKeys.history(slug, variables.issueId),
      });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useRestoreIssue(
  slug: string,
  options?: UseMutationOptions<
    IssueDetail,
    IssuesApiError,
    { issueId: string },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ issueId }) => restoreIssue(slug, issueId),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(issueKeys.detail(slug, variables.issueId), data);
      void queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
      // Archive / restore / label writes each append a history row.
      void queryClient.invalidateQueries({
        queryKey: issueKeys.history(slug, variables.issueId),
      });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useDeleteIssue(
  slug: string,
  options?: UseMutationOptions<
    DeleteIssueResponse,
    IssuesApiError,
    { issueId: string; body: DeleteIssueRequest },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ issueId, body }) => deleteIssue(slug, issueId, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.removeQueries({
        queryKey: issueKeys.detail(slug, variables.issueId),
      });
      queryClient.removeQueries({
        queryKey: issueKeys.history(slug, variables.issueId),
      });
      void queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

// ── Issue label membership ──

export function useAttachLabel(
  slug: string,
  options?: UseMutationOptions<
    IssueDetail,
    IssuesApiError,
    { issueId: string; body: AttachLabelRequest },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ issueId, body }) => attachLabel(slug, issueId, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(issueKeys.detail(slug, variables.issueId), data);
      void queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
      // Archive / restore / label writes each append a history row.
      void queryClient.invalidateQueries({
        queryKey: issueKeys.history(slug, variables.issueId),
      });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useDetachLabel(
  slug: string,
  options?: UseMutationOptions<
    IssueDetail,
    IssuesApiError,
    { issueId: string; labelId: string },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ issueId, labelId }) => detachLabel(slug, issueId, labelId),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(issueKeys.detail(slug, variables.issueId), data);
      void queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
      // Archive / restore / label writes each append a history row.
      void queryClient.invalidateQueries({
        queryKey: issueKeys.history(slug, variables.issueId),
      });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

// ── Labels — mutations ──

export function useCreateLabel(
  slug: string,
  options?: UseMutationOptions<
    LabelCard,
    IssuesApiError,
    CreateLabelRequest,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: (body) => createLabel(slug, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      void queryClient.invalidateQueries({ queryKey: labelKeys.list(slug) });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useUpdateLabel(
  slug: string,
  options?: UseMutationOptions<
    LabelCard,
    IssuesApiError,
    { labelId: string; body: UpdateLabelRequest },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ labelId, body }) => updateLabel(slug, labelId, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      void queryClient.invalidateQueries({ queryKey: labelKeys.list(slug) });
      // Issues render label colors/names inline — a rename/recolour must
      // refresh every board/list showing it.
      void queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useDeleteLabel(
  slug: string,
  options?: UseMutationOptions<
    DeleteLabelResponse,
    IssuesApiError,
    { labelId: string },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ labelId }) => deleteLabel(slug, labelId),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      void queryClient.invalidateQueries({ queryKey: labelKeys.list(slug) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export { IssuesApiError };
