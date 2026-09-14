import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type UseInfiniteQueryOptions,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type {
  ClearAllResponse,
  DeleteNotificationResponse,
  MarkAllReadResponse,
  NotificationCard,
  NotificationListPage,
  UnreadCount,
} from '@shipyard/shared';

import {
  clearAllNotifications,
  deleteNotification,
  getNotification,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationsApiError,
  type ClearAllParams,
  type ListNotificationsParams,
  type MarkAllReadParams,
} from '@/lib/api/notifications';

// ─────────────────────────────────────────────────────────────────────────────
// Notification queries + mutations (F6)
//
// Two readers, deliberately separate (api-design §2, D7):
//   • `useUnreadCount` — the ~60s heartbeat behind the header badge. Polls,
//     pauses while the tab is hidden, and stays silent on failure (a poll
//     error must never surface as an error banner).
//   • `useInfiniteNotifications` — the panel walk, fetched on open/focus, not
//     on a timer. Cursor-paged newest-first; the client appends pages verbatim.
//
// Mutations are pessimistic for rows (the server is authoritative) but drop the
// badge immediately for responsiveness, rolling back if the write fails. The
// badge is derived, never stored — the next poll reconciles regardless.
// ─────────────────────────────────────────────────────────────────────────────

export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (
    params?: Pick<ListNotificationsParams, 'unreadOnly' | 'workspaceId'>,
  ) => [...notificationKeys.lists(), params ?? {}] as const,
  details: () => [...notificationKeys.all, 'detail'] as const,
  detail: (notificationId: string) =>
    [...notificationKeys.details(), notificationId] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
} as const;

/** Panel page size — default 25, max 100 (server-enforced). */
export const NOTIFICATION_PAGE_SIZE = 25;

/** Badge poll interval — the MVP has no push (arch §11). */
export const UNREAD_POLL_INTERVAL = 60 * 1000;

type NotificationPages = InfiniteData<NotificationListPage, string | undefined>;

// ── Cache helpers ──

/** Splice a card across every cached panel page (all filter variants). */
function updateCachedNotifications(
  queryClient: QueryClient,
  updater: (cards: NotificationCard[]) => NotificationCard[],
): void {
  queryClient.setQueriesData<NotificationPages>(
    { queryKey: notificationKeys.lists() },
    (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map((page) => ({
          ...page,
          notifications: updater(page.notifications),
        })),
      };
    },
  );
}

/** Find a card anywhere it is cached — detail first, then the panel pages. */
function cachedNotification(
  queryClient: QueryClient,
  notificationId: string,
): NotificationCard | undefined {
  const detail = queryClient.getQueryData<NotificationCard>(
    notificationKeys.detail(notificationId),
  );
  if (detail) return detail;

  const lists = queryClient.getQueriesData<NotificationPages>({
    queryKey: notificationKeys.lists(),
  });
  for (const [, data] of lists) {
    const found = data?.pages
      .flatMap((page) => page.notifications)
      .find((card) => card.id === notificationId);
    if (found) return found;
  }
  return undefined;
}

// ── Badge (polling) ──

/**
 * #2 — the header badge source. Polls every ~60s and pauses while the tab is
 * hidden. Failures are intentionally swallowed by the consumer (keep the last
 * count, no banner); this hook never throws into the UI by itself.
 */
export function useUnreadCount(
  options?: Omit<
    UseQueryOptions<UnreadCount, NotificationsApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: getUnreadCount,
    refetchInterval: UNREAD_POLL_INTERVAL,
    refetchIntervalInBackground: false,
    ...options,
  });
}

// ── Panel (cursor walk) ──

/**
 * #1 — the panel walk, newest-first. `fetchNextPage()` follows `nextCursor`
 * until it is `null`. Keyed on the filter (never the cursor) so switching
 * All/Unread keeps one cache entry per filter instead of one per page.
 *
 * Manual, not infinite-scroll: the panel renders what it has and asks for the
 * next page when the reader clicks "Load more" (same posture as issue history).
 */
export function useInfiniteNotifications(
  params?: Pick<ListNotificationsParams, 'unreadOnly' | 'workspaceId'>,
  options?: Omit<
    UseInfiniteQueryOptions<
      NotificationListPage,
      NotificationsApiError,
      NotificationPages,
      readonly unknown[],
      string | undefined
    >,
    'queryKey' | 'queryFn' | 'initialPageParam' | 'getNextPageParam'
  >,
) {
  const unreadOnly = params?.unreadOnly;
  const workspaceId = params?.workspaceId;

  return useInfiniteQuery({
    queryKey: notificationKeys.list({ unreadOnly, workspaceId }),
    queryFn: ({ pageParam }) =>
      listNotifications({
        unreadOnly,
        workspaceId,
        limit: NOTIFICATION_PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // The panel loads on open and on window focus, never on a timer.
    refetchOnWindowFocus: true,
    ...options,
  });
}

/**
 * #3 — permalink validation. Used before navigating from a row so a retracted
 * or deleted source shows a removed-state instead of a dead link.
 */
export function useNotification(
  notificationId: string | null | undefined,
  options?: Omit<
    UseQueryOptions<NotificationCard, NotificationsApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled = Boolean(notificationId) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useQuery({
    queryKey: notificationKeys.detail(notificationId ?? ''),
    queryFn: () => getNotification(notificationId as string),
    enabled,
    ...rest,
  });
}

// ── Mutations ──

/**
 * #4 — mark one read. Optimistically drops the badge only when the cached card
 * was actually unread (the server no-ops otherwise, and the poll reconciles).
 */
export function useMarkNotificationRead(
  options?: UseMutationOptions<
    NotificationCard,
    NotificationsApiError,
    string,
    { previous?: UnreadCount }
  >,
) {
  const queryClient = useQueryClient();
  const { onMutate, onError, onSuccess, ...rest } = options ?? {};

  return useMutation({
    mutationFn: (notificationId: string) =>
      markNotificationRead(notificationId),
    ...rest,
    onMutate: (notificationId, mutation) => {
      const wasUnread = !cachedNotification(queryClient, notificationId)
        ?.readAt;
      const previous = queryClient.getQueryData<UnreadCount>(
        notificationKeys.unreadCount(),
      );
      if (wasUnread && previous) {
        queryClient.setQueryData<UnreadCount>(notificationKeys.unreadCount(), {
          unreadCount: Math.max(0, previous.unreadCount - 1),
        });
      }
      onMutate?.(notificationId, mutation);
      return { previous };
    },
    onError: (error, variables, context, mutation) => {
      if (context?.previous) {
        queryClient.setQueryData(
          notificationKeys.unreadCount(),
          context.previous,
        );
      }
      onError?.(error, variables, context, mutation);
    },
    onSuccess: (card, variables, context, mutation) => {
      queryClient.setQueryData(notificationKeys.detail(card.id), card);
      updateCachedNotifications(queryClient, (cards) =>
        cards.map((existing) => (existing.id === card.id ? card : existing)),
      );
      // The optimistic decrement in `onMutate` is a guess — it only fires when
      // the card happened to be in the cache. Reconcile the badge against the
      // server now instead of letting a wrong guess stand until the next poll
      // (which can be a full interval away). The count query is active, so this
      // refetches immediately; the panels are closed and merely go stale.
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.unreadCount(),
      });
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.lists(),
      });
      onSuccess?.(card, variables, context, mutation);
    },
  });
}

/** #5 — mark all read. `markedCount: 0` is a success, not an error. */
export function useMarkAllNotificationsRead(
  options?: UseMutationOptions<
    MarkAllReadResponse,
    NotificationsApiError,
    MarkAllReadParams | undefined,
    { previous?: UnreadCount }
  >,
) {
  const queryClient = useQueryClient();
  const { onMutate, onError, onSuccess, ...rest } = options ?? {};

  return useMutation({
    mutationFn: (params) => markAllNotificationsRead(params),
    ...rest,
    onMutate: (variables, mutation) => {
      const previous = queryClient.getQueryData<UnreadCount>(
        notificationKeys.unreadCount(),
      );
      queryClient.setQueryData<UnreadCount>(notificationKeys.unreadCount(), {
        unreadCount: 0,
      });
      onMutate?.(variables, mutation);
      return { previous };
    },
    onError: (error, variables, context, mutation) => {
      if (context?.previous) {
        queryClient.setQueryData(
          notificationKeys.unreadCount(),
          context.previous,
        );
      }
      onError?.(error, variables, context, mutation);
    },
    onSuccess: (result, variables, context, mutation) => {
      // The server sets one shared `readAt`; mirror it so the panel does not
      // flash unread rows until the refetch lands.
      const readAt = new Date().toISOString();
      updateCachedNotifications(queryClient, (cards) =>
        cards.map((card) =>
          card.readAt === null &&
          (!variables?.workspaceId ||
            card.workspaceId === variables.workspaceId)
            ? { ...card, readAt }
            : card,
        ),
      );
      if (variables?.workspaceId) {
        void queryClient.invalidateQueries({
          queryKey: notificationKeys.lists(),
        });
        void queryClient.invalidateQueries({
          queryKey: notificationKeys.unreadCount(),
        });
      }
      onSuccess?.(result, variables, context, mutation);
    },
  });
}

/** #6 — dismiss one permanently. */
export function useDeleteNotification(
  options?: UseMutationOptions<
    DeleteNotificationResponse,
    NotificationsApiError,
    string,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};

  return useMutation({
    mutationFn: (notificationId: string) => deleteNotification(notificationId),
    ...rest,
    onSuccess: (result, variables, context, mutation) => {
      queryClient.removeQueries({
        queryKey: notificationKeys.detail(result.deletedNotificationId),
      });
      updateCachedNotifications(queryClient, (cards) =>
        cards.filter((card) => card.id !== result.deletedNotificationId),
      );
      // Same reasoning as mark-read: never trust the local guess about whether
      // the dismissed row was unread — ask the server.
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.unreadCount(),
      });
      onSuccess?.(result, variables, context, mutation);
    },
  });
}

/** #7 — clear all (or the read-only / per-workspace subset). Irreversible. */
export function useClearAllNotifications(
  options?: UseMutationOptions<
    ClearAllResponse,
    NotificationsApiError,
    ClearAllParams | undefined,
    unknown
  >,
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};

  return useMutation({
    mutationFn: (params) => clearAllNotifications(params),
    ...rest,
    onSuccess: (result, variables, context, mutation) => {
      // Unfiltered clear-all empties every panel cache, so drop the rows in
      // place and zero the badge instead of refetching an inbox we know is gone.
      const unfiltered =
        !variables?.workspaceId && variables?.readOnly !== 'true';
      if (unfiltered) {
        queryClient.setQueriesData<NotificationPages>(
          { queryKey: notificationKeys.lists() },
          (prev) =>
            prev
              ? {
                  ...prev,
                  pages: prev.pages.map((page) => ({
                    ...page,
                    notifications: [],
                  })),
                }
              : prev,
        );
        queryClient.setQueryData<UnreadCount>(notificationKeys.unreadCount(), {
          unreadCount: 0,
        });
      } else {
        void queryClient.invalidateQueries({
          queryKey: notificationKeys.lists(),
        });
        void queryClient.invalidateQueries({
          queryKey: notificationKeys.unreadCount(),
        });
      }
      onSuccess?.(result, variables, context, mutation);
    },
  });
}

export { NotificationsApiError };
