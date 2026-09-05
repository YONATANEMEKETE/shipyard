/**
 * Dashboard domain errors (api-design.md §7). Deliberately tiny: the module
 * is a single read-only GET — workspace misses/non-membership surface as
 * `WORKSPACE_NOT_FOUND` from the workspace module (no existence leak), and
 * a panel-source failure is an honest `500` via the global handler (no
 * partial payloads). There is no validation surface (no body/query beyond
 * the slug shape), no FORBIDDEN_ROLE (no roles), no *_ARCHIVED 409s (a GET
 * with zero container mutations), and no NOT_FOUND for empty panels
 * (emptiness is data — spec rule 5). This file exists to keep the canonical
 * module layout.
 */

export const DashboardErrorCodes = {} as const;

export type DashboardErrorCode =
  (typeof DashboardErrorCodes)[keyof typeof DashboardErrorCodes];
