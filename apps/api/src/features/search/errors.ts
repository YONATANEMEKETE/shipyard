/**
 * Search module errors — intentionally near-empty (api-design §9.1).
 *
 * - Workspace scoping errors are passthrough: `WORKSPACE_NOT_FOUND` (404)
 *   comes from the shared `resolveWorkspaceContext` guard, byte-equal for
 *   unknown slugs and non-members (no existence leak).
 * - `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401) and `RATE_LIMITED`
 *   (429) come from the shared guard chain / F12 wiring, not this module.
 * - A failing leg is a plain 500 — the fan-out never returns partial
 *   groups, so no per-leg error codes exist (§7). There is no
 *   `FORBIDDEN_ROLE` (no role gate) and no `*_ARCHIVED` 409s (archived
 *   entities are excluded by predicate, not rejected).
 *
 * Add an export here only if a genuinely search-specific failure mode
 * appears; don't pre-create unused error classes.
 */
export {};
