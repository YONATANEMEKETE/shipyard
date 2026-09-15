import {
  keepPreviousData,
  useQuery,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { SearchResults, SearchType } from '@shipyard/shared';

import { searchWorkspace, type SearchApiError } from '@/lib/api/search';

// ─────────────────────────────────────────────────────────────────────────────
// Search queries — the single endpoint, keyed on (slug, q, type).
//
// Keystroke discipline (api-design §11): the caller debounces the input, and
// the query key changes per debounced value, so TanStack Query cancels
// superseded requests for free. `keepPreviousData` keeps the last grouped
// result on screen while the next one lands, so the dialog never flickers
// back to skeletons mid-type.
// ─────────────────────────────────────────────────────────────────────────────

export const searchKeys = {
  all: ['search'] as const,
  results: (slug: string, q: string, type?: SearchType) =>
    [...searchKeys.all, slug, q, type ?? 'all'] as const,
} as const;

/** Trailing-edge debounce — returns `value` only after it settles. */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

/**
 * Delay gate — flips `active` on only after it has stayed true for `delay`ms.
 * Used to suppress the skeleton flash on fast responses: the dialog keeps the
 * previous grouped result on screen for a beat before swapping to skeleton
 * rows, so only genuinely slow searches render the Loading variant.
 */
export function useDelayedFlag(active: boolean, delay = 180): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    // Both transitions are scheduled (never synchronous setState in the effect
    // body): `active` schedules the delay, `!active` clears it on the next tick.
    const id = window.setTimeout(() => setOn(active), active ? delay : 0);
    return () => window.clearTimeout(id);
  }, [active, delay]);

  // `&& active` makes the off-transition immediate regardless of the timer.
  return on && active;
}

export function useSearch(
  slug: string,
  params: { q: string; type?: SearchType },
  options?: Omit<
    UseQueryOptions<SearchResults, SearchApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const q = params.q.trim();
  const type = params.type;
  const { enabled: extraEnabled = true, ...rest } = options ?? {};

  return useQuery({
    queryKey: searchKeys.results(slug, q, type),
    queryFn: () => searchWorkspace(slug, { q, type }),
    // A blank query is the designed empty state, never a request (spec §3.1).
    enabled: Boolean(slug) && q.length > 0 && extraEnabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    ...rest,
  });
}
