import type { SearchResults, WorkspaceMemberCard } from '@shipyard/shared';
import { prisma } from '../../common/db/client.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';
import { toCard as toIssueCard } from '../issues/service.js';
import { toCard as toProjectCard } from '../projects/service.js';
import { toCard as toCommentCard } from '../comments/service.js';
import { progressFor, toCard as toCycleCard } from '../cycles/service.js';
import {
  findIssueByIdentifier,
  hydrateComments,
  hydrateCycles,
  hydrateIssues,
  hydrateProjects,
  rankedCommentHits,
  rankedCycleIds,
  rankedIssueIds,
  rankedProjectIds,
  searchMemberRows,
} from './repository.js';
import type { SearchQueryParams } from './schemas.js';

/**
 * Search service — fan-out orchestration only (api-design §8.1); no domain
 * rules of its own. Read-only, workspace-scoped by construction: every leg
 * takes the context's workspaceId (never a client-supplied id), so a
 * smuggled foreign id matches zero rows.
 *
 * Bound resolution (data-model D8): the per-group bound is the explicit
 * `limit` (1–50) or 20 — raised to 50 when `type` narrows to one group.
 * Suggestions are the same legs with `limit=5` (spec §3.3). Comments cap
 * lower (≤10) per the locked scope. A failing leg throws → 500; there are
 * no partial groups (api-design §7).
 */

/** Comments are capped lower than the other groups (locked scope, §8.1). */
const COMMENT_MAX = 10;

const IDENTIFIER_PATTERN = /^SHIP-(\d+)$/i;

function parseIdentifier(query: string): number | null {
  const match = IDENTIFIER_PATTERN.exec(query);
  if (!match) return null;
  const seqNumber = Number.parseInt(match[1] ?? '', 10);
  return Number.isNaN(seqNumber) ? null : seqNumber;
}

/**
 * Preserves the ranked order from the ids leg through hydration: ranked ids
 * arrive in final order; hydration is an unordered id lookup.
 */
function orderRows<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row] as const));
  const ordered: T[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) ordered.push(row);
  }
  return ordered;
}

function toMemberCard(row: {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: WorkspaceMemberCard['role'];
  createdAt: Date;
}): WorkspaceMemberCard {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    name: row.name,
    email: row.email,
    image: row.image,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

export const searchService = {
  async search(
    context: WorkspaceRequestContext,
    query: SearchQueryParams,
  ): Promise<SearchResults> {
    const { q, type } = query;
    const workspaceId = context.workspaceId;

    const empty: SearchResults = {
      q,
      issues: [],
      projects: [],
      cycles: [],
      members: [],
      comments: [],
    };

    // Blank-but-present query ⇒ 200 with empty groups — never an error,
    // never an everything-dump (spec §3.1). No legs run at all.
    if (q === '') return empty;

    const bound = query.limit ?? (type ? 50 : 20);

    // "Search within" — only the selected group populates (api-design §5.1).
    if (type === 'issues') {
      return {
        ...empty,
        issues: await searchService.issuesLeg(workspaceId, q, bound),
      };
    }
    if (type === 'projects') {
      return {
        ...empty,
        projects: await searchService.projectsLeg(workspaceId, q, bound),
      };
    }
    if (type === 'cycles') {
      return {
        ...empty,
        cycles: await searchService.cyclesLeg(workspaceId, q, bound),
      };
    }
    if (type === 'members') {
      return {
        ...empty,
        members: await searchService.membersLeg(workspaceId, q, bound),
      };
    }
    if (type === 'comments') {
      return {
        ...empty,
        comments: await searchService.commentsLeg(workspaceId, q, bound),
      };
    }

    // Grouped search — five bounded legs in parallel; any failure rejects
    // the whole response (500 + retry, never partial groups).
    const [issues, projects, cycles, members, comments] = await Promise.all([
      searchService.issuesLeg(workspaceId, q, bound),
      searchService.projectsLeg(workspaceId, q, bound),
      searchService.cyclesLeg(workspaceId, q, bound),
      searchService.membersLeg(workspaceId, q, bound),
      searchService.commentsLeg(workspaceId, q, bound),
    ]);

    return { q, issues, projects, cycles, members, comments };
  },

  /**
   * Issues leg — identifier fast path first (api-design §8.3): on `SHIP-###`
   * the exact non-archived in-workspace issue leads; remaining slots fill by
   * rank and the ranked leg excludes the exact id (it can't appear twice).
   * Unknown/deleted/archived numbers fall through to the normal legs.
   */
  async issuesLeg(workspaceId: string, q: string, bound: number) {
    const seqNumber = parseIdentifier(q);
    const exact =
      seqNumber !== null
        ? await findIssueByIdentifier(workspaceId, seqNumber)
        : null;

    const remaining = exact ? bound - 1 : bound;
    const hits =
      remaining > 0
        ? await rankedIssueIds(workspaceId, q, remaining, exact?.id)
        : [];
    const ids = hits.map((hit) => hit.id);
    const rows = orderRows(await hydrateIssues(workspaceId, ids), ids).map(
      toIssueCard,
    );

    return exact ? [toIssueCard(exact), ...rows] : rows;
  },

  async projectsLeg(workspaceId: string, q: string, bound: number) {
    const hits = await rankedProjectIds(workspaceId, q, bound);
    const ids = hits.map((hit) => hit.id);
    const rows = orderRows(await hydrateProjects(workspaceId, ids), ids);
    return rows.map(toProjectCard);
  },

  async cyclesLeg(workspaceId: string, q: string, bound: number) {
    const hits = await rankedCycleIds(workspaceId, q, bound);
    const ids = hits.map((hit) => hit.id);
    const rows = orderRows(await hydrateCycles(workspaceId, ids), ids);
    if (rows.length === 0) return [];
    // Progress ships inline on the card (same derivation as the cycles
    // module — batched once for all hits, no N+1).
    const progress = await progressFor(
      prisma,
      workspaceId,
      rows.map((row) => row.id),
    );
    return rows.map((row) => {
      const cycleProgress = progress.get(row.id);
      return toCycleCard(
        row,
        cycleProgress ?? { total: 0, completed: 0, percent: null },
      );
    });
  },

  async membersLeg(workspaceId: string, q: string, bound: number) {
    const rows = await searchMemberRows(workspaceId, q, bound);
    return rows.map(toMemberCard);
  },

  async commentsLeg(workspaceId: string, q: string, bound: number) {
    const commentBound = Math.min(bound, COMMENT_MAX);
    const hits = await rankedCommentHits(workspaceId, q, commentBound);
    const ids = hits.map((hit) => hit.id);
    const rows = orderRows(await hydrateComments(workspaceId, ids), ids);
    const contextById = new Map(hits.map((hit) => [hit.id, hit] as const));
    return rows.map((row) => {
      const hit = contextById.get(row.id);
      return {
        ...toCommentCard(row),
        issueId: row.issueId,
        issueIdentifier: `SHIP-${hit?.issueSeqNumber ?? 0}`,
        issueTitle: hit?.issueTitle ?? '',
      };
    });
  },
};
