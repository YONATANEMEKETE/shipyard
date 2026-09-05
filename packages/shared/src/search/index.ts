import { z } from 'zod';
import { commentCardSchema } from '../comments/index.js';
import { cycleCardSchema } from '../cycles/index.js';
import { issueCardSchema } from '../issues/index.js';
import { projectCardSchema } from '../projects/index.js';
import { workspaceMemberCardSchema } from '../members/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Search contracts
//
// Owned by the search module (F10). Consumed by both the API (route-boundary
// validation, response shape) and the web app (header search box, grouped
// results view). Entity cards are re-exported from their owning modules —
// never redefined — except the comment hit, which needs issue context for
// the grouped display + `#comment-<id>` permalink (data-model §4).
//
// Wire coercion of q/type/limit (trim, bounds, defaults, the blank-q echo
// special case) lives in the API's route-local schemas.ts (same split as
// issues/cycles/comments); this file holds the canonical domain shapes both
// sides share — no parallel shapes.
// ─────────────────────────────────────────────────────────────────────────────

// ── Query contract ──

// "Search within" dropdown — the five searchable groups, fixed union, no
// free-form types (data-model §1). No `all` variant: omitted type means all
// groups, so the wire never carries a sixth value.
export const searchTypeSchema = z.enum([
  'issues',
  'projects',
  'cycles',
  'members',
  'comments',
]);

export type SearchType = z.infer<typeof searchTypeSchema>;

// Canonical query contract (data-model §4). `q` is required — a missing key
// is a 400 VALIDATION_ERROR — and trims to 1–200 chars. The blank-but-present
// case (`?q=%20%20`) is NOT a validation failure: the API's route-local wire
// coercion special-cases it into a 200 with empty groups + `q: ""` echo
// (api-design §5.1 — spec rule 4: never an error, never a dump).
//
// `limit` bounds EACH group, not the total — groups are independent result
// sets (D8). Default 20, or 50 when `type` is set; suggestions pass 5.
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  type: searchTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

// ── Response contracts ──

// A comment hit plus its issue context — the grouped view renders the issue
// identifier/title and links the permalink anchor `#comment-<id>` (comments
// api-design #2 convention). `issueId` duplicates `commentCard.issueId`
// deliberately: explicit for hit rendering, no destructuring gymnastics.
export const searchCommentHitSchema = commentCardSchema.extend({
  issueId: z.string(),
  issueIdentifier: z.string(), // SHIP-### verbatim
  issueTitle: z.string(),
});

export type SearchCommentHit = z.infer<typeof searchCommentHitSchema>;

// Grouped search response — five bounded arrays with independent orders
// (D8): no merged cross-type ranking, the UI renders groups anyway
// ("Issues · 4"). Empty arrays are valid and hidden client-side (empty-group
// pruning), never an error. `q` echoes the trimmed query so the no-result
// state can render "No results for …" + clear.
//
// When `?type=` filters, only that array populates (others `[]`) with the
// bound raised to 50. Suggestions reuse this exact shape with `limit=5` —
// no separate suggestion contract (spec §3.3: same search, tighter limit).
export const searchResultsSchema = z.object({
  q: z.string(),
  issues: z.array(issueCardSchema),
  projects: z.array(projectCardSchema),
  cycles: z.array(cycleCardSchema),
  members: z.array(workspaceMemberCardSchema),
  comments: z.array(searchCommentHitSchema),
});

export type SearchResults = z.infer<typeof searchResultsSchema>;
