import type {
  ActivityArea,
  ActivityEntityType,
  ActivityListPage,
} from '@shipyard/shared';

import { requestJson } from '@/lib/api/request';

// ─────────────────────────────────────────────────────────────────────────────
// Activity API client — the workspace narrative read path
//
// Browser → Next rewrite → internal API (ADR-003). Every request forwards the
// HttpOnly session cookie via credentials:include. Response envelopes:
// success { data }, error { error: { code, message, ... } }.
//
// One route family, workspace-scoped (api-design §2):
//   GET /workspaces/:slug/activity — newest-first cursor walk
//
// There is deliberately no create call: events are minted inside the source
// transaction by the emitting service (D2), never over HTTP. Any member reads
// all (spec rule 4), and archived workspaces stay readable, so this client
// never sends a role gate and never expects a 403 for scope.
//
// Mirrors apps/api/src/features/activity/routes.ts + schemas.ts and the shared
// contracts in packages/shared/src/activity.
// ─────────────────────────────────────────────────────────────────────────────

export class ActivityApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(args: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
    requestId?: string;
  }) {
    super(args.message);
    this.name = 'ActivityApiError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.requestId = args.requestId;
  }
}

function activityBase(slug: string): string {
  return `/api/v1/workspaces/${encodeURIComponent(slug)}/activity`;
}

// ── Query params (mirror the route-local listActivityQuerySchema) ──

export interface ListActivityParams {
  /** Filter chip → kind set, expanded server-side (api-design §5.1). */
  area?: ActivityArea;
  /** Narrow to one actor. */
  actorId?: string;
  /** Narrow to one entity family. */
  entityType?: ActivityEntityType;
  /** 1..100, server default 25. Omitted lets the server decide. */
  limit?: number;
  /**
   * Opaque base64url cursor over (createdAt, id) DESC. Bound to the
   * newest-first order, so it is only ever fed back from `nextCursor` — never
   * constructed or hand-edited by the client.
   */
  cursor?: string;
}

/**
 * #1 — the page walk. Newest-first; `nextCursor: null` marks the end of the
 * log. Unknown `area`/`actorId`/`entityType` values match zero rows rather
 * than 404ing (filters, not scope), so an empty `events` array is a valid
 * success the caller renders as an empty state, never as an error.
 */
export function listActivity(
  slug: string,
  params?: ListActivityParams,
): Promise<ActivityListPage> {
  return requestJson<ActivityListPage>(
    `${activityBase(slug)}${buildQuery(params)}`,
    { method: 'GET' },
    'Failed to load activity',
    ActivityApiError,
  );
}

function buildQuery(params?: ListActivityParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export { ActivityApiError as default };
