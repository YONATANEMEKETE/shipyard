/**
 * Activity domain errors (api-design.md §7). The module is read-only over
 * HTTP — a single list route with workspace-context guards — so there are
 * no activity-specific error codes. Workspace misses/non-membership surface
 * as `WORKSPACE_NOT_FOUND` from the workspace module; bad query params
 * surface as `VALIDATION_ERROR` via the global handler. This file exists to
 * keep the canonical module layout (route → controller → service →
 * repository → errors).
 */

export const ActivityErrorCodes = {} as const;

export type ActivityErrorCode =
  (typeof ActivityErrorCodes)[keyof typeof ActivityErrorCodes];
