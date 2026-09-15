import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { Dashboard } from '@shipyard/shared';

import { DashboardApiError, getDashboard } from '@/lib/api/dashboard';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard query — one composed read for the hub
//
// The endpoint returns all four panels at once (api-design §5.2), so there is
// one query and one cache entry per workspace — not four. Panels therefore
// share a single loading and error state: a partial hub is not a state the API
// can produce, and splitting the cache would invent one.
//
// Rows inside the panels are the owning modules' own cards (issue, cycle,
// project), so drill-down needs no dashboard-specific fetch — the detail pages
// key off the card ids.
// ─────────────────────────────────────────────────────────────────────────────

export const dashboardKeys = {
  all: ['dashboard'] as const,
  details: () => [...dashboardKeys.all, 'detail'] as const,
  detail: (slug: string) => [...dashboardKeys.details(), slug] as const,
} as const;

export function useDashboard(
  slug: string | null | undefined,
  options?: Omit<
    UseQueryOptions<Dashboard, DashboardApiError>,
    'queryKey' | 'queryFn' | 'enabled'
  > & { enabled?: boolean },
) {
  const enabled = Boolean(slug) && (options?.enabled ?? true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled: _ignored, ...rest } = options ?? {};
  return useQuery({
    queryKey: slug ? dashboardKeys.detail(slug) : dashboardKeys.details(),
    queryFn: () => getDashboard(slug as string),
    enabled,
    ...rest,
  });
}
