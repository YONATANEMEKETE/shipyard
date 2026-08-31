import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type {
  ChangeMemberRoleRequest,
  RemoveMemberRequest,
  TransferOwnershipRequest,
  WorkspaceMemberCard,
} from '@shipyard/shared';

import {
  changeMemberRole,
  getMember,
  leaveWorkspace,
  listMembers,
  MembersApiError,
  removeMember,
  transferOwnership,
} from '@/lib/api/members';

import { workspaceKeys } from '@/hooks/use-workspaces';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys — single place to keep cache keys consistent across the app.
// All member queries are keyed off the workspace slug so invalidations stay
// precise per workspace.
// ─────────────────────────────────────────────────────────────────────────────

export const memberKeys = {
  all: ['members'] as const,
  lists: () => [...memberKeys.all, 'list'] as const,
  list: (slug: string) => [...memberKeys.lists(), slug] as const,
  details: () => [...memberKeys.all, 'detail'] as const,
  detail: (slug: string, memberId: string) =>
    [...memberKeys.details(), slug, memberId] as const,
} as const;

// ── Queries ──

export function useMembers(
  slug: string | null | undefined,
  options?: Omit<
    UseQueryOptions<{ members: WorkspaceMemberCard[] }, MembersApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled = Boolean(slug) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useQuery({
    queryKey: slug ? memberKeys.list(slug) : memberKeys.lists(),
    queryFn: () => listMembers(slug as string),
    enabled,
    ...rest,
  });
}

export function useMember(
  slug: string | null | undefined,
  memberId: string | null | undefined,
  options?: Omit<
    UseQueryOptions<WorkspaceMemberCard, MembersApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled =
    Boolean(slug) && Boolean(memberId) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useQuery({
    queryKey:
      slug && memberId
        ? memberKeys.detail(slug, memberId)
        : memberKeys.details(),
    queryFn: () => getMember(slug as string, memberId as string),
    enabled,
    ...rest,
  });
}

// ── Mutations ──

export function useChangeMemberRole(
  slug: string,
  options?: UseMutationOptions<
    WorkspaceMemberCard,
    MembersApiError,
    { memberId: string; body: ChangeMemberRoleRequest },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ memberId, body }) => changeMemberRole(slug, memberId, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(memberKeys.detail(slug, data.id), data);
      void queryClient.invalidateQueries({ queryKey: memberKeys.list(slug) });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useRemoveMember(
  slug: string,
  options?: UseMutationOptions<
    { removedMemberId: string; transferredProjects: number },
    MembersApiError,
    RemoveMemberRequest,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: (body) => removeMember(slug, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.removeQueries({
        queryKey: memberKeys.detail(slug, variables.memberId),
      });
      void queryClient.invalidateQueries({ queryKey: memberKeys.list(slug) });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useLeaveWorkspace(
  slug: string,
  options?: UseMutationOptions<
    { transferredProjects: number },
    MembersApiError,
    void,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: () => leaveWorkspace(slug),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.removeQueries({ queryKey: memberKeys.list(slug) });
      queryClient.removeQueries({ queryKey: workspaceKeys.detail(slug) });
      void queryClient.invalidateQueries({ queryKey: memberKeys.all });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useTransferOwnership(
  slug: string,
  options?: UseMutationOptions<
    { members: [WorkspaceMemberCard, WorkspaceMemberCard] },
    MembersApiError,
    TransferOwnershipRequest,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: (body) => transferOwnership(slug, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      for (const member of data.members) {
        queryClient.setQueryData(memberKeys.detail(slug, member.id), member);
      }
      void queryClient.invalidateQueries({ queryKey: memberKeys.list(slug) });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export { MembersApiError };
