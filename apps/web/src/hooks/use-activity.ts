import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import type { ActivityArea, ActivityListPage } from '@shipyard/shared';

import {
  ActivityApiError,
  listActivity,
  type ListActivityParams,
} from '@/lib/api/activity';

// ─────────────────────────────────────────────────────────────────────────────
// Activity query — the workspace feed walk
//
// One reader: `useInfiniteActivity` — a manual "Load more" cursor walk over
// `/workspaces/:slug/activity`, newest-first (same posture as the notification
// panel and issue history; no infinite scroll).
//
// Filtering is server-side: the chip maps to `area`, and the API expands it
// into that area's kind set, so switching facets refetches instead of filtering
// a partially-loaded list client-side. The key holds the filter (never the
// cursor) so each facet keeps one cache entry rather than one per page.
//
// Rows are frozen snapshots (D5) — actor, entity title, and summary are
// rendered verbatim and never re-resolved against live entities, which is why
// there is no detail query and no cache-patching helper here: nothing mutates
// an event after it is written.
// ─────────────────────────────────────────────────────────────────────────────

export const activityKeys = {
  all: ['activity'] as const,
  lists: () => [...activityKeys.all, 'list'] as const,
  list: (
    slug: string,
    params: Pick<ListActivityParams, 'area' | 'actorId' | 'entityType'> = {},
  ) => [...activityKeys.lists(), slug, params] as const,
} as const;

/** Feed page size — server default is 25, max 100. */
export const ACTIVITY_PAGE_SIZE = 25;

type ActivityPages = InfiniteData<ActivityListPage, string | undefined>;

export interface ActivityFilters {
  /** Chip selection. `undefined` means "all" — the segment id is never sent. */
  area?: ActivityArea;
  actorId?: string;
  entityType?: ListActivityParams['entityType'];
}

/**
 * The feed walk. `fetchNextPage()` follows `nextCursor` until it is `null`,
 * which `hasNextPage` reflects directly so the "Load more" affordance can hide
 * itself at the end of the log.
 *
 * `enabled` mirrors the other workspace-scoped hooks: a null/undefined slug
 * (e.g. shell still resolving) parks the query instead of firing a bad request.
 */
export function useInfiniteActivity(
  slug: string | null | undefined,
  filters?: ActivityFilters,
  options?: Omit<
    UseInfiniteQueryOptions<
      ActivityListPage,
      ActivityApiError,
      ActivityPages,
      readonly unknown[],
      string | undefined
    >,
    'queryKey' | 'queryFn' | 'initialPageParam' | 'getNextPageParam' | 'enabled'
  > & { enabled?: boolean },
) {
  const area = filters?.area;
  const actorId = filters?.actorId;
  const entityType = filters?.entityType;
  const enabled = Boolean(slug) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};

  return useInfiniteQuery({
    queryKey: slug
      ? activityKeys.list(slug, { area, actorId, entityType })
      : activityKeys.lists(),
    queryFn: ({ pageParam }) =>
      listActivity(slug as string, {
        area,
        actorId,
        entityType,
        limit: ACTIVITY_PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    // The log is append-only and mostly read on arrival; refresh when the
    // reader comes back rather than polling (unlike the notification badge).
    refetchOnWindowFocus: true,
    ...rest,
  });
}
