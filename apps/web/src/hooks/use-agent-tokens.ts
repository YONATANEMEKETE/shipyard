import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type {
  CreateMcpTokenRequest,
  CreateMcpTokenResponse,
  DeleteMcpTokenResponse,
  ListMcpTokensResponse,
  RevokeMcpTokenResponse,
} from '@shipyard/shared';

import {
  AgentTokensApiError,
  createAgentToken,
  deleteAgentToken,
  listAgentTokens,
  revokeAgentToken,
} from '@/lib/api/agent-tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Agent-access hooks (F13) — the data layer for the two surfaces:
//   • Account Settings card  → the member's own connections (`all: false`)
//   • Workspace Settings     → every connection in the workspace (`all: true`,
//                              offered to OWNER|ADMIN only)
//
// Both variants live under one key namespace per workspace, so a single
// invalidation keeps the card and the admin section consistent — they render
// the same rows from the same server truth, and nothing is applied
// optimistically (api-design §9.3 discipline: credentials are server state).
// ─────────────────────────────────────────────────────────────────────────────

export const agentTokenKeys = {
  all: ['agent-tokens'] as const,
  lists: () => [...agentTokenKeys.all, 'list'] as const,
  list: (slug: string, all: boolean) =>
    [...agentTokenKeys.lists(), slug, { all }] as const,
} as const;

// ── Queries ──

/**
 * `slug` is nullable so the hook can be mounted before the workspace resolves
 * (the query stays disabled rather than firing against an empty path).
 */
export function useAgentTokens(
  slug: string | null | undefined,
  { all = false }: { all?: boolean } = {},
  options?: Omit<
    UseQueryOptions<ListMcpTokensResponse, AgentTokensApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled = Boolean(slug) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};

  return useQuery({
    queryKey: slug ? agentTokenKeys.list(slug, all) : agentTokenKeys.lists(),
    queryFn: () => listAgentTokens(slug as string, { all }),
    enabled,
    ...rest,
  });
}

// ── Mutations ──

export function useCreateAgentToken(
  slug: string,
  options?: UseMutationOptions<
    CreateMcpTokenResponse,
    AgentTokensApiError,
    CreateMcpTokenRequest,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};

  return useMutation({
    mutationFn: (body: CreateMcpTokenRequest) => createAgentToken(slug, body),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      // Invalidate rather than seed the cache from the response: this response
      // is the only place the plaintext token exists, and a query cache is the
      // wrong place for a secret (devtools panels, memory snapshots, and any
      // later render that reads the list would all carry it). The list refetch
      // returns the card without the secret.
      void queryClient.invalidateQueries({ queryKey: agentTokenKeys.lists() });
      onSuccess?.(data, variables, context, mutation);
    },
  });
}

/** Drop a connection out of every cached list (own list and the admin list). */
function dropTokenFromCaches(queryClient: QueryClient, tokenId: string): void {
  queryClient.setQueriesData<ListMcpTokensResponse>(
    { queryKey: agentTokenKeys.lists() },
    (old) =>
      old
        ? { tokens: old.tokens.filter((token) => token.id !== tokenId) }
        : old,
  );
}

export function useDeleteAgentToken(
  slug: string,
  options?: UseMutationOptions<
    DeleteMcpTokenResponse,
    AgentTokensApiError,
    string,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, onError, ...rest } = options ?? {};

  return useMutation({
    mutationFn: (tokenId: string) => deleteAgentToken(slug, tokenId),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      dropTokenFromCaches(queryClient, data.deletedTokenId);
      onSuccess?.(data, variables, context, mutation);
    },
    onError: (error, variables, context, mutation) => {
      // Already gone — which is the outcome the caller wanted, so a double
      // click, a second tab, or another device's delete reports success rather
      // than an error about a state the member was trying to reach.
      if (error.code === 'TOKEN_NOT_FOUND') {
        dropTokenFromCaches(queryClient, variables);
        onSuccess?.(
          { deletedTokenId: variables },
          variables,
          context,
          mutation,
        );
        return;
      }
      onError?.(error, variables, context, mutation);
    },
  });
}

export function useRevokeAgentToken(
  slug: string,
  options?: UseMutationOptions<
    RevokeMcpTokenResponse,
    AgentTokensApiError,
    string,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};

  return useMutation({
    mutationFn: (tokenId: string) => revokeAgentToken(slug, tokenId),
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      // The revoke response is the updated card, so patch it into every cached
      // list that may hold it (own list and the admin list) instead of refetching
      // both — the row flips to "Revoked" without a spinner.
      queryClient.setQueriesData<ListMcpTokensResponse>(
        { queryKey: agentTokenKeys.lists() },
        (old) =>
          old
            ? {
                tokens: old.tokens.map((token) =>
                  token.id === data.id ? data : token,
                ),
              }
            : old,
      );
      onSuccess?.(data, variables, context, mutation);
    },
  });
}
