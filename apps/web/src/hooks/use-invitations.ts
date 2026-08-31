import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type {
  InviteMembersRequest,
  InvitationCard,
  InvitationPreview,
  ResendInvitationRequest,
  RevokeInvitationRequest,
} from '@shipyard/shared';

import {
  AcceptInvitationResponse,
  acceptInvitation,
  declineInvitation,
  inviteMembers,
  InvitationsApiError,
  listInvitations,
  previewInvitation,
  resendInvitation,
  revokeInvitation,
} from '@/lib/api/invitations';

import { memberKeys } from '@/hooks/use-members';
import { workspaceKeys } from '@/hooks/use-workspaces';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys — covers both the workspace-scoped management list and the
// token-gated preview surface. Token keys live at the top level so the preview
// is addressable from anywhere in the tree.
// ─────────────────────────────────────────────────────────────────────────────

export const invitationKeys = {
  all: ['invitations'] as const,
  lists: () => [...invitationKeys.all, 'list'] as const,
  list: (slug: string) => [...invitationKeys.lists(), slug] as const,
  previews: () => [...invitationKeys.all, 'preview'] as const,
  preview: (token: string) => [...invitationKeys.previews(), token] as const,
} as const;

// ── Queries ──

export type InvitationStatusFilter =
  'PENDING' | 'ACCEPTED' | 'REVOKED' | 'DECLINED' | 'EXPIRED';

export function useInvitations(
  slug: string | null | undefined,
  status?: InvitationStatusFilter,
  options?: Omit<
    UseQueryOptions<{ invitations: InvitationCard[] }, InvitationsApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled = Boolean(slug) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useQuery({
    queryKey: slug
      ? [...invitationKeys.list(slug), status ?? 'ALL']
      : invitationKeys.lists(),
    queryFn: () => listInvitations(slug as string, status),
    enabled,
    ...rest,
  });
}

export function useInvitationPreview(
  token: string | null | undefined,
  options?: Omit<
    UseQueryOptions<InvitationPreview, InvitationsApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled = Boolean(token) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useQuery({
    queryKey: token ? invitationKeys.preview(token) : invitationKeys.previews(),
    queryFn: () => previewInvitation(token as string),
    enabled,
    ...rest,
  });
}

// ── Mutations ──

export function useInviteMembers(
  slug: string,
  options?: UseMutationOptions<
    { invitations: InvitationCard[] },
    InvitationsApiError,
    InviteMembersRequest,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: (body) => inviteMembers(slug, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      void queryClient.invalidateQueries({
        queryKey: invitationKeys.list(slug),
      });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useResendInvitation(
  slug: string,
  options?: UseMutationOptions<
    InvitationCard,
    InvitationsApiError,
    ResendInvitationRequest,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: (body) => resendInvitation(slug, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      void queryClient.invalidateQueries({
        queryKey: invitationKeys.list(slug),
      });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useRevokeInvitation(
  slug: string,
  options?: UseMutationOptions<
    InvitationCard,
    InvitationsApiError,
    RevokeInvitationRequest,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: (body) => revokeInvitation(slug, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      void queryClient.invalidateQueries({
        queryKey: invitationKeys.list(slug),
      });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useAcceptInvitation(
  options?: UseMutationOptions<
    AcceptInvitationResponse,
    InvitationsApiError,
    { token: string },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ token }) => acceptInvitation(token),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.removeQueries({
        queryKey: invitationKeys.preview(variables.token),
      });
      void queryClient.invalidateQueries({ queryKey: memberKeys.all });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export function useDeclineInvitation(
  options?: UseMutationOptions<
    InvitationCard,
    InvitationsApiError,
    { token: string },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ token }) => declineInvitation(token),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.removeQueries({
        queryKey: invitationKeys.preview(variables.token),
      });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

export { InvitationsApiError };
