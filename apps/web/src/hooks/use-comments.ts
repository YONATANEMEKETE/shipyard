import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  CommentCard,
  CreateCommentRequest,
  DeleteCommentResponse,
} from '@shipyard/shared';

import {
  CommentsApiError,
  createComment,
  deleteComment,
  listComments,
  updateComment,
  type ListCommentsResponse,
} from '@/lib/api/comments';
import { issueKeys } from '@/hooks/use-issues';

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
      // The issue card badge (commentCount) is now stale — the count lives in
      // the issues list cache, not the comment thread cache.
      void queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
      onSuccess?.(card, variables, context, mutation);
    },
  });
}

/**
 * #4 — edit own comment. The server is authoritative here in a way create is
 * not: it sets `editedAt` and recomputes `mentions[]` against current members,
 * so the returned card is spliced over the cached one rather than refetched.
 * Nothing re-notifies (rule 4), so no notification cache invalidation.
 */
export function useUpdateComment(
  slug: string,
  issueId: string,
  options?: UseMutationOptions<
    CommentCard,
    CommentsApiError,
    { commentId: string; content: string },
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: ({ commentId, content }) =>
      updateComment(slug, issueId, commentId, { content }),
    ...rest,
    onSuccess: (card, variables, context, mutation) => {
      queryClient.setQueryData<
        InfiniteData<ListCommentsResponse, string | undefined>
      >(commentKeys.list(slug, issueId), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map((page) => ({
            ...page,
            comments: page.comments.map((comment) =>
              comment.id === card.id ? card : comment,
            ),
          })),
        };
      });
      onSuccess?.(card, variables, context, mutation);
    },
  });
}

/**
 * #5 — delete own comment. No tombstone: the row is dropped from whichever
 * cached page holds it, so the thread closes up without a refetch. Mentions and
 * the comment's notification rows died with it server-side (D8).
 */
export function useDeleteComment(
  slug: string,
  issueId: string,
  options?: UseMutationOptions<
    DeleteCommentResponse,
    CommentsApiError,
    string,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(slug, issueId, commentId),
    ...rest,
    onSuccess: (response, variables, context, mutation) => {
      queryClient.setQueryData<
        InfiniteData<ListCommentsResponse, string | undefined>
      >(commentKeys.list(slug, issueId), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map((page) => ({
            ...page,
            comments: page.comments.filter(
              (comment) => comment.id !== response.deletedCommentId,
            ),
          })),
        };
      });
      // Same staleness rule as create: the card badge count changed.
      void queryClient.invalidateQueries({ queryKey: issueKeys.lists() });
      onSuccess?.(response, variables, context, mutation);
    },
  });
}
