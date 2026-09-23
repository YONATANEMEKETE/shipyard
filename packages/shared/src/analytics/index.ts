import { z } from 'zod';

import { issueStatusSchema } from '../issues/index.js';
import { mcpTokenScopeSchema } from '../mcp/tokens.js';
import { workspaceRoleSchema } from '../workspace/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Analytics event contract (PostHog)
//
// One source of truth for every event the web app and the API report, so the
// two reporters cannot drift. The browser reports through `posthog-js`, the API
// through `posthog-node`; both import this map, and both validate with
// `parseAnalyticsEvent` before anything reaches the network.
//
// Rules baked into these shapes:
//
//  - **No personal data.** Properties carry ids, enums, and counts — never
//    names, emails, issue titles, or comment bodies. PostHog is a third-party
//    store, and the privacy posture in `shipyard-design/04-Engineering/
//    deployment.md` §7 applies to it exactly as it does to Sentry.
//  - **Database ids, not slugs or URLs.** A renamed workspace must not fork its
//    own history.
//  - **Snake_case, past tense.** An event records what already happened
//    (`issue_created`), which keeps the distance from commands obvious at the
//    call site.
//  - **Few events, rich properties.** `issue_created` carries the issue's
//    status and source instead of splitting into several creation events;
//    funnels and trends filter by property rather than by event name.
//  - **Identity is not part of the contract.** PostHog's `distinct_id` is the
//    user id, supplied by the reporter — the browser identifies after sign-in,
//    the API passes the session's user explicitly.
//
// The five events marked *funnel* are the activation funnel: signed_up →
// workspace_created → project_created → issue_created → member_invited. The
// rest answer specific product questions and stay deliberately few; adding one
// means writing down the question it answers.
// ─────────────────────────────────────────────────────────────────────────────

export const analyticsEventSchemas = {
  /** *funnel* — server-side, when the account row is created. */
  signed_up: z.object({
    method: z.enum(['email', 'google', 'github']),
  }),

  /** *funnel* — server-side, after the workspace row is committed. */
  workspace_created: z.object({
    workspaceId: z.string().cuid(),
  }),

  /** *funnel* — server-side. */
  project_created: z.object({
    workspaceId: z.string().cuid(),
    projectId: z.string().cuid(),
  }),

  /**
   * *funnel* — server-side, for issues created through the web UI and for
   * those created by an agent (`source: 'mcp'`). Which interface a team works
   * through is the question this property exists to answer.
   */
  issue_created: z.object({
    workspaceId: z.string().cuid(),
    projectId: z.string().cuid(),
    issueId: z.string().cuid(),
    status: issueStatusSchema,
    source: z.enum(['ui', 'mcp']),
  }),

  /**
   * *funnel* — server-side, once the invitation exists. Acceptance is a
   * separate event because the two halves of the loop fail for different
   * reasons.
   */
  member_invited: z.object({
    workspaceId: z.string().cuid(),
    role: workspaceRoleSchema,
  }),

  /** The second half of the invite loop: the invited person actually joined. */
  invitation_accepted: z.object({
    workspaceId: z.string().cuid(),
    role: workspaceRoleSchema,
  }),

  comment_created: z.object({
    workspaceId: z.string().cuid(),
    issueId: z.string().cuid(),
  }),

  /**
   * Cycle lifecycle. Starting a cycle is the signal that a team is actually
   * planning rather than only filing.
   */
  cycle_started: z.object({
    workspaceId: z.string().cuid(),
    cycleId: z.string().cuid(),
  }),

  /**
   * Agent adoption. Scopes are the canonical enum, so renaming or adding a
   * scope cannot silently change what a historical event meant.
   */
  mcp_token_created: z.object({
    workspaceId: z.string().cuid(),
    scopes: z.array(mcpTokenScopeSchema).min(1),
  }),
} as const;

export type AnalyticsEventName = keyof typeof analyticsEventSchemas;

export type AnalyticsEventProperties<E extends AnalyticsEventName> = z.infer<
  (typeof analyticsEventSchemas)[E]
>;

/**
 * The contract each reporter implements. The browser's version additionally
 * runs PostHog's page-load lifecycle; the API's version additionally takes the
 * acting user's id as `distinct_id`. The signatures differ by necessity — the
 * events do not.
 */
export type TrackFunction = <E extends AnalyticsEventName>(
  event: E,
  properties: AnalyticsEventProperties<E>,
) => void;

/**
 * Validates properties against the event's schema. Both reporters call this
 * before sending: a malformed property — a missing id, a status that no longer
 * exists — should fail at the call site in development, never quietly distort a
 * chart in production.
 */
export function parseAnalyticsEvent<E extends AnalyticsEventName>(
  event: E,
  properties: unknown,
): AnalyticsEventProperties<E> {
  // Zod's per-key inference cannot correlate through the indexed access; the
  // cast is that correlation, and `.parse` has already validated the shape.
  return analyticsEventSchemas[event].parse(
    properties,
  ) as AnalyticsEventProperties<E>;
}
