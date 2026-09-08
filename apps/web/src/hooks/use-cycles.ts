import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { CycleCard, CycleDetail } from '@shipyard/shared';
import {
  CyclesApiError,
  listCycles,
  getCycle,
  type ListCyclesParams,
} from '@/lib/api/cycles';

export const cycleKeys = {
  all: ['cycles'] as const,
  lists: () => [...cycleKeys.all, 'list'] as const,
  list: (slug: string, params?: ListCyclesParams) =>
    [...cycleKeys.lists(), slug, params ?? {}] as const,
  details: () => [...cycleKeys.all, 'detail'] as const,
  detail: (slug: string, cycleId: string) =>
    [...cycleKeys.details(), slug, cycleId] as const,
} as const;

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

export { CyclesApiError };
