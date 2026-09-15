import type { Dashboard } from '@shipyard/shared';

import { requestJson } from '@/lib/api/request';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard API client — the workspace hub's composed payload
//
// Browser → Next rewrite → internal API (ADR-003). Every request forwards the
// HttpOnly session cookie via credentials:include. Response envelopes:
// success { data }, error { error: { code, message, ... } }.
//
// One endpoint covers every panel (api-design §5.2):
//   GET /workspaces/:slug/dashboard — all four panels in a single response
//
// There is deliberately no per-panel route, no query params, and no trail
// write here. Panels are derived at read time from owning modules' tables
// (data-model D1), empty panels are data rather than errors (spec rule 5), and
// the recently-viewed trail is a best-effort side effect of the issue detail
// read — not something the hub posts back.
//
// Mirrors apps/api/src/features/dashboard/routes.ts and the composed contract
// in packages/shared/src/dashboard.
// ─────────────────────────────────────────────────────────────────────────────

export class DashboardApiError extends Error {
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
    this.name = 'DashboardApiError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.requestId = args.requestId;
  }
}

/**
 * The composed hub payload: `myWork`, `currentCycle`, `activeProjects`, and
 * `recentActivity` in one response — four panels, one round trip.
 *
 * Any member reads it (no role gate) and archived workspaces still serve 200,
 * so a 403 for scope is not a case this client handles.
 */
export function getDashboard(slug: string): Promise<Dashboard> {
  return requestJson<Dashboard>(
    `/api/v1/workspaces/${encodeURIComponent(slug)}/dashboard`,
    { method: 'GET' },
    'Failed to load dashboard',
    DashboardApiError,
  );
}

export { DashboardApiError as default };
