import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type { CommentCard, CreateCommentRequest } from '@shipyard/shared';

import {
  CommentsApiError,
  createComment,
  listComments,
  type ListCommentsResponse,
} from '@/lib/api/comments';

// ─────────────────────────────────────────────────────────────────────────────
// Comment queries + mutations — keyed per issue so invalidations stay precise
// and the conversation shares one cache entry between the thread and anything
// else that touches it. Mirrors use-issues / use-projects.
// ─────────────────────────────────────────────────────────────────────────────

export const commentKeys = {
  all: ['comments'] as const,
  lists: () => [...commentKeys.all, 'list'] as const,
  list: (slug: string, issueId: string) =>
    [...commentKeys.lists(), slug, issueId] as const,
};

/** Comments page size — the thread loads the newest 10, then older on demand. */
export const COMMENT_PAGE_SIZE = 10;

/**
 * Conversation (#1) — cursor-paged, oldest first, so every extra page is OLDER
 * than the last one. Manual, not infinite-scroll: the thread renders the pages
 * it has and asks for the previous page when the reader clicks.
 */
export function useInfiniteComments(
  slug: string | null | undefined,
  issueId: string | null | undefined,
  options?: Omit<
    UseInfiniteQueryOptions<
      ListCommentsResponse,
      CommentsApiError,
      InfiniteData<ListCommentsResponse, string | undefined>,
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
      slug && issueId ? commentKeys.list(slug, issueId) : commentKeys.lists(),
    queryFn: ({ pageParam }) =>
      listComments(slug as string, issueId as string, {
        limit: COMMENT_PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    ...rest,
  });
}

export function useCreateComment(
  slug: string,
  issueId: string,
  options?: UseMutationOptions<
    CommentCard,
    CommentsApiError,
    CreateCommentRequest,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: (body: CreateCommentRequest) =>
      createComment(slug, issueId, body),
    ...rest,
    onSuccess: (card, variables, context, mutation) => {
      // The server re-parses mentions on write, so the returned card is
      // authoritative. Appending it keeps the thread stable instead of
      // refetching every comment in view.
      queryClient.setQueryData<
        InfiniteData<ListCommentsResponse, string | undefined>
      >(commentKeys.list(slug, issueId), (prev) => {
        if (!prev) return prev;
        // Newest comment belongs to the last (newest) page.
        const lastIndex = prev.pages.length - 1;
        return {
          ...prev,
          pages: prev.pages.map((page, index) =>
            index === lastIndex
              ? { ...page, comments: [...page.comments, card] }
              : page,
          ),
        };
      });
      onSuccess?.(card, variables, context, mutation);
    },
  });
}
