import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type {
  CreateCycleRequest,
  CycleCard,
  CycleDetail,
  DeleteCycleResponse,
  UpdateCycleRequest,
} from '@shipyard/shared';

import {
  archiveCycle,
  completeCycle,
  createCycle,
  CyclesApiError,
  deleteCycle,
  getCycle,
  listCycles,
  reopenCycle,
  restoreCycle,
  startCycle,
  updateCycle,
  type ListCyclesParams,
} from '@/lib/api/cycles';

// ─────────────────────────────────────────────────────────────────────────────
// Cycle queries + mutations (F7)
//
// Query keys — single place to keep cache keys consistent across the app. All
// cycle queries are keyed off the workspace slug so invalidations stay precise
// per workspace. Mirrors use-projects / use-issues patterns.
//
// Mutations are pessimistic (api-design §9.3): the server owns scheduling
// (overlap, single-active) and lifecycle legality, so a lifecycle write never
// flips status optimistically — the returned detail is the truth we cache.
// Lifecycle only changes *which* cycles a filtered list contains, so every
// write invalidates the list family (the Dashboard's active-cycle read is a
// `GET ?status=ACTIVE` list entry and is covered by the same prefix).
// ─────────────────────────────────────────────────────────────────────────────

export const cycleKeys = {
  all: ['cycles'] as const,
  lists: () => [...cycleKeys.all, 'list'] as const,
  list: (slug: string, params?: ListCyclesParams) =>
    [...cycleKeys.lists(), slug, params ?? {}] as const,
  details: () => [...cycleKeys.all, 'detail'] as const,
  detail: (slug: string, cycleId: string) =>
    [...cycleKeys.details(), slug, cycleId] as const,
} as const;

// ── Queries ──

export function useCycles(
  slug: string | null | undefined,
  params?: ListCyclesParams,
  options?: Omit<
    UseQueryOptions<{ cycles: CycleCard[] }, CyclesApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled = Boolean(slug) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useQuery({
    queryKey: slug ? cycleKeys.list(slug, params) : cycleKeys.lists(),
    queryFn: () => listCycles(slug as string, params),
    enabled,
    ...rest,
  });
}

export function useCycle(
  slug: string | null | undefined,
  cycleId: string | null | undefined,
  options?: Omit<
    UseQueryOptions<CycleDetail, CyclesApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled =
    Boolean(slug) && Boolean(cycleId) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useQuery({
    queryKey:
      slug && cycleId ? cycleKeys.detail(slug, cycleId) : cycleKeys.details(),
    queryFn: () => getCycle(slug as string, cycleId as string),
    enabled,
    ...rest,
  });
}

// ── Mutations ──

export function useCreateCycle(
  slug: string,
  options?: UseMutationOptions<
    CycleDetail,
    CyclesApiError,
    CreateCycleRequest,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: (body) => createCycle(slug, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(cycleKeys.detail(slug, data.id), data);
      void queryClient.invalidateQueries({ queryKey: cycleKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useUpdateCycle(
  slug: string,
  options?: UseMutationOptions<
    CycleDetail,
    CyclesApiError,
    { cycleId: string; body: UpdateCycleRequest },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ cycleId, body }) => updateCycle(slug, cycleId, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(cycleKeys.detail(slug, variables.cycleId), data);
      // Name/date edits reorder date-sorted lists and re-render cards.
      void queryClient.invalidateQueries({ queryKey: cycleKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

// ── Lifecycle — confirmed transitions, each returns the updated detail ──

export function useStartCycle(
  slug: string,
  options?: UseMutationOptions<
    CycleDetail,
    CyclesApiError,
    { cycleId: string },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ cycleId }) => startCycle(slug, cycleId),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(cycleKeys.detail(slug, variables.cycleId), data);
      void queryClient.invalidateQueries({ queryKey: cycleKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useCompleteCycle(
  slug: string,
  options?: UseMutationOptions<
    CycleDetail,
    CyclesApiError,
    { cycleId: string },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ cycleId }) => completeCycle(slug, cycleId),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(cycleKeys.detail(slug, variables.cycleId), data);
      // Completion leaves issues untouched (rule 9) — no issue cache to bump.
      void queryClient.invalidateQueries({ queryKey: cycleKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useReopenCycle(
  slug: string,
  options?: UseMutationOptions<
    CycleDetail,
    CyclesApiError,
    { cycleId: string },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ cycleId }) => reopenCycle(slug, cycleId),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(cycleKeys.detail(slug, variables.cycleId), data);
      void queryClient.invalidateQueries({ queryKey: cycleKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useArchiveCycle(
  slug: string,
  options?: UseMutationOptions<
    CycleDetail,
    CyclesApiError,
    { cycleId: string },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ cycleId }) => archiveCycle(slug, cycleId),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(cycleKeys.detail(slug, variables.cycleId), data);
      // Archived cycles drop out of the default (non-archived) list.
      void queryClient.invalidateQueries({ queryKey: cycleKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useRestoreCycle(
  slug: string,
  options?: UseMutationOptions<
    CycleDetail,
    CyclesApiError,
    { cycleId: string },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ cycleId }) => restoreCycle(slug, cycleId),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(cycleKeys.detail(slug, variables.cycleId), data);
      // Restore returns to the pre-archive status, so it re-enters the
      // default list and may become the active one.
      void queryClient.invalidateQueries({ queryKey: cycleKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useDeleteCycle(
  slug: string,
  options?: UseMutationOptions<
    DeleteCycleResponse,
    CyclesApiError,
    { cycleId: string },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ cycleId }) => deleteCycle(slug, cycleId),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.removeQueries({
        queryKey: cycleKeys.detail(slug, variables.cycleId),
      });
      void queryClient.invalidateQueries({ queryKey: cycleKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export { CyclesApiError };
