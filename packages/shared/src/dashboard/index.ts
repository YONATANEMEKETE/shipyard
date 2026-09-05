import { z } from 'zod';
import { issueAssigneeCardSchema, issueCardSchema } from '../issues/index.js';
import { cycleCardSchema, cycleProgressSchema } from '../cycles/index.js';
import { projectCardSchema } from '../projects/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard contracts
//
// Owned by the dashboard module (F9). Consumed by both the API (composed
// payload construction, response shape) and the web app (hub panels, render
// map). Contracts only — dashboard is a view module: every panel is derived
// at read time from owning modules' tables (data-model D1), so there are no
// request bodies and no stored panel shapes here.
//
// Entity cards are imported from their owning modules — never redefined
// (data-model §4): the web renders the exact same issue/cycle/project cards
// on the hub as on the owning pages. They surface to consumers through the
// package barrel (exported once, from their owning modules) — this file only
// composes with them. Panel bounds (10/10/10/1/≤20/≤20) are locked product
// decisions enforced server-side (api-design §5.1); they are not schema-level
// max() constraints because emptiness and bounds are data, not validation
// failures (spec rule 5).
// ─────────────────────────────────────────────────────────────────────────────

// ── My Work (spec §3.1) ──

// Three personal groups, all scoped to the signed-in user. `assigned` and
// `created` are open issues only (archivedAt IS NULL AND status != DONE —
// service filter, locked §2.2); `recentlyViewed` carries the trail recency
// timestamp so the hub can order/render relative time client-side.
export const dashboardMyWorkSchema = z.object({
  assigned: z.array(issueCardSchema), // open, assigned to me (≤10)
  created: z.array(issueCardSchema), // open, created by me (≤10)
  recentlyViewed: z.array(
    // live issues from my trail (≤10 of the capped 50); archived issues
    // stay in via their archivedAt flag on the card (personal history)
    issueCardSchema.extend({ viewedAt: z.string().datetime() }),
  ),
});

export type DashboardMyWork = z.infer<typeof dashboardMyWorkSchema>;

// ── Current Cycle (spec §3.1) ──

// The workspace's single active non-archived cycle with inline progress
// (cycleCardSchema verbatim), or null — the designed empty state, never a
// 404 (spec rule 5).
export const dashboardCycleSchema = cycleCardSchema.nullable();

export type DashboardCycle = z.infer<typeof dashboardCycleSchema>;

// ── Active Projects (spec §3.1) ──

// Active non-archived projects, hard cap 20 (service-side safety bound).
// The F4 card in this codebase ships without progress, so the hub panel
// extends it additively with the shared progress shape (derived at read
// time — never stored) so Active Projects renders its progress bars with
// no second fetch. Empty array when none.
export const dashboardProjectsSchema = z.array(
  projectCardSchema.extend({ progress: cycleProgressSchema }),
);

export type DashboardProjects = z.infer<typeof dashboardProjectsSchema>;

// ── Recent Activity (data-model D4, sourced from the activity feed) ──

// Closed kind set for the hub feed. Sourced from activity rows (Activity Log
// §8.4 migration — same bound, same card mapping), mapped server-side:
// PRIORITY/PROJECT/CYCLE/DUE/TITLE_CHANGED collapse into the single
// ISSUE_PLANNING_CHANGED bucket (details live in `text`). No project/cycle
// kinds until a future panel contract extends this enum.
export const dashboardActivityKindSchema = z.enum([
  'ISSUE_STATUS_CHANGED',
  'ISSUE_BLOCKED_SET',
  'ISSUE_BLOCKED_CLEARED',
  'ISSUE_ASSIGNED',
  'ISSUE_UNASSIGNED',
  'ISSUE_PLANNING_CHANGED', // priority/project/cycle/due/title bucket (details in text)
  'ISSUE_ARCHIVED',
  'ISSUE_RESTORED',
  'ISSUE_CREATED',
  'COMMENT_CREATED',
]);

export type DashboardActivityKind = z.infer<typeof dashboardActivityKindSchema>;

// One hub feed row. `actor` falls back to null for former members (legacy —
// names resolve via batch lookup, never per item). `commentId` is set only
// for COMMENT_CREATED items (web scroll target #comment-<id>). `text` is the
// server-rendered summary — copy is data here, not client prose.
export const dashboardActivityItemSchema = z.object({
  kind: dashboardActivityKindSchema,
  actor: issueAssigneeCardSchema.nullable(),
  issue: z.object({
    id: z.string(),
    identifier: z.string(),
    title: z.string(),
  }),
  workspaceId: z.string(),
  commentId: z.string().nullable(),
  text: z.string(),
  createdAt: z.string().datetime(),
});

export type DashboardActivityItem = z.infer<typeof dashboardActivityItemSchema>;

// ── Composed payload (api-design §5.1 — one request, four panels) ──

export const dashboardSchema = z.object({
  workspaceId: z.string(),
  myWork: dashboardMyWorkSchema,
  currentCycle: dashboardCycleSchema,
  activeProjects: dashboardProjectsSchema,
  recentActivity: z.array(dashboardActivityItemSchema), // ≤20, newest first
});

export type Dashboard = z.infer<typeof dashboardSchema>;
