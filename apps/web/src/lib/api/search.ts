import type { SearchResults, SearchType } from '@shipyard/shared';

import { ApiError, requestJson } from '@/lib/api/request';

// ─────────────────────────────────────────────────────────────────────────────
// Search API client — workspace-scoped grouped lookup (F10)
//
// Browser → Next rewrite → internal API (ADR-003). Mirrors
// apps/api/src/features/search/routes.ts and the shared contracts in
// packages/shared/src/search. One endpoint serves suggestions (limit=5) and
// the "search within" filter (?type=) — no second path exists.
// ─────────────────────────────────────────────────────────────────────────────

export class SearchApiError extends ApiError {}

export interface SearchParams {
  /** Trimmed query. Blank is never sent — the dialog short-circuits first. */
  q: string;
  /** "Search within" — omitted means all groups. */
  type?: SearchType;
  /** Per-group bound (1–50). Server defaults: 20, or 50 when `type` is set. */
  limit?: number;
}

export function searchWorkspace(
  slug: string,
  params: SearchParams,
): Promise<SearchResults> {
  const query = new URLSearchParams({ q: params.q });
  if (params.type) query.set('type', params.type);
  if (params.limit !== undefined) query.set('limit', String(params.limit));

  return requestJson<SearchResults>(
    `/api/v1/workspaces/${encodeURIComponent(slug)}/search?${query.toString()}`,
    { method: 'GET' },
    'Search failed',
    SearchApiError,
  );
}
