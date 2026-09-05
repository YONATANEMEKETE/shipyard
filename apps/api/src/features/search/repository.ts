import { prisma } from '../../common/db/client.js';
import { Prisma } from '../../generated/client.js';
import type { WorkspaceRole } from '@shipyard/shared';
import { issueInclude } from '../issues/repository.js';
import { projectInclude } from '../projects/repository.js';
import { commentInclude } from '../comments/repository.js';

/**
 * Search repository — the documented standing exception to the "read via
 * owning service" rule (api-design §9.1, dashboard §3.2 precedent): the
 * ranked reads hit other modules' tables directly, because rank ordering
 * (`ts_rank DESC, updatedAt DESC, id ASC`) is inexpressible through the
 * owning list contracts, and the generated `search_tsv` columns exist solely
 * for this consumer. The exception is query plumbing only — returned shapes
 * are the owning card rows, mapped by the owning services' exported mappers.
 *
 * Two-phase per FTS leg (data-model §6.1):
 *  1. ranked ids — typed `$queryRaw` over the GIN-indexed `search_tsv`
 *     column, bounded by `LIMIT`;
 *  2. hydration — Prisma `findMany` with the owning module's include, so
 *     card assembly reuses the owning mapper byte-for-byte (no shape drift).
 *
 * Every leg is workspace-scoped and excludes archived rows (D6); every bound
 * is caller-supplied (service-resolved) — no unbounded query exists here.
 */

/** One ranked hit: the row id plus its FTS rank (for ordering). */
export interface RankedHit {
  id: string;
  rank: number;
}

/** Comment-leg extra context needed for the hit shape (permalink target). */
export interface RankedCommentHit extends RankedHit {
  issueSeqNumber: number;
  issueTitle: string;
}

/** Flat member join row (D5 — name-only `ILIKE`, no vector machinery). */
export interface MemberRow {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: WorkspaceRole;
  createdAt: Date;
}

// ── Query shaping (D4) ────────────────────────────────────────────────────

/**
 * Builds the prefix-tsquery string: each sanitized token suffixed `:*` and
 * AND-combined, so as-you-type prefixes match and multi-term AND semantics
 * hold (spec §3.1). Tokens are stripped to word characters — `to_tsquery`
 * treats `& | ! ( )` as operators, and client input must never be parsed as
 * tsquery syntax. Stop words degrade gracefully (Postgres ignores them, no
 * error); returns null when nothing usable remains (symbol-only input) and
 * the leg runs ILIKE-only (spec rule 4: a valid query never errors).
 */
function toPrefixTsQuery(query: string): string | null {
  const tokens = query.match(/[A-Za-z0-9_]+/g);
  if (!tokens || tokens.length === 0) return null;
  return tokens.map((token) => `${token}:*`).join(' & ');
}

/**
 * Short-token rule (D4): queries under 2 chars skip the tsquery arm entirely
 * — the stemmer discards most of them, so the ILIKE containment arm carries
 * the leg (recency order within the bound).
 */
function tsqueryArmFor(query: string): string | null {
  if (query.length < 2) return null;
  return toPrefixTsQuery(query);
}

/** Escapes ILIKE metacharacters so client input is matched literally. */
function toIlikePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

// ── Ranked id legs (raw SQL) ──────────────────────────────────────────────

export async function rankedIssueIds(
  workspaceId: string,
  query: string,
  limit: number,
  excludeId?: string,
): Promise<RankedHit[]> {
  const ts = tsqueryArmFor(query);
  const pattern = toIlikePattern(query);
  const excludeClause = excludeId
    ? Prisma.sql` AND i.id <> ${excludeId}`
    : Prisma.empty;
  if (ts !== null) {
    return prisma.$queryRaw<RankedHit[]>`
      SELECT i.id AS id, ts_rank(i."search_tsv", q) AS rank
      FROM "issue" i, to_tsquery('english', ${ts}) AS q
      WHERE i."workspaceId" = ${workspaceId}
        AND i."archivedAt" IS NULL${excludeClause}
        AND (
          i."search_tsv" @@ q
          OR (
            coalesce(i."title", '') || ' ' || coalesce(i."description", '')
          ) ILIKE ${pattern}
        )
      ORDER BY rank DESC, i."updatedAt" DESC, i.id ASC
      LIMIT ${limit}`;
  }
  return prisma.$queryRaw<RankedHit[]>`
    SELECT i.id AS id, 0 AS rank
    FROM "issue" i
    WHERE i."workspaceId" = ${workspaceId}
      AND i."archivedAt" IS NULL${excludeClause}
      AND (
        coalesce(i."title", '') || ' ' || coalesce(i."description", '')
      ) ILIKE ${pattern}
    ORDER BY i."updatedAt" DESC, i.id ASC
    LIMIT ${limit}`;
}

export async function rankedProjectIds(
  workspaceId: string,
  query: string,
  limit: number,
): Promise<RankedHit[]> {
  const ts = tsqueryArmFor(query);
  const pattern = toIlikePattern(query);
  if (ts !== null) {
    return prisma.$queryRaw<RankedHit[]>`
      SELECT p.id AS id, ts_rank(p."search_tsv", q) AS rank
      FROM "project" p, to_tsquery('english', ${ts}) AS q
      WHERE p."workspaceId" = ${workspaceId}
        AND p."archivedAt" IS NULL
        AND (
          p."search_tsv" @@ q
          OR (
            coalesce(p."name", '') || ' ' || coalesce(p."description", '')
          ) ILIKE ${pattern}
        )
      ORDER BY rank DESC, p."updatedAt" DESC, p.id ASC
      LIMIT ${limit}`;
  }
  return prisma.$queryRaw<RankedHit[]>`
    SELECT p.id AS id, 0 AS rank
    FROM "project" p
    WHERE p."workspaceId" = ${workspaceId}
      AND p."archivedAt" IS NULL
      AND (
        coalesce(p."name", '') || ' ' || coalesce(p."description", '')
      ) ILIKE ${pattern}
    ORDER BY p."updatedAt" DESC, p.id ASC
    LIMIT ${limit}`;
}

export async function rankedCycleIds(
  workspaceId: string,
  query: string,
  limit: number,
): Promise<RankedHit[]> {
  const ts = tsqueryArmFor(query);
  const pattern = toIlikePattern(query);
  if (ts !== null) {
    return prisma.$queryRaw<RankedHit[]>`
      SELECT c.id AS id, ts_rank(c."search_tsv", q) AS rank
      FROM "cycle" c, to_tsquery('english', ${ts}) AS q
      WHERE c."workspaceId" = ${workspaceId}
        AND c."archivedAt" IS NULL
        AND (
          c."search_tsv" @@ q
          OR (
            coalesce(c."name", '') || ' ' || coalesce(c."goal", '')
          ) ILIKE ${pattern}
        )
      ORDER BY rank DESC, c."updatedAt" DESC, c.id ASC
      LIMIT ${limit}`;
  }
  return prisma.$queryRaw<RankedHit[]>`
    SELECT c.id AS id, 0 AS rank
    FROM "cycle" c
    WHERE c."workspaceId" = ${workspaceId}
      AND c."archivedAt" IS NULL
      AND (
        coalesce(c."name", '') || ' ' || coalesce(c."goal", '')
      ) ILIKE ${pattern}
    ORDER BY c."updatedAt" DESC, c.id ASC
    LIMIT ${limit}`;
}

/**
 * Comment leg — same FTS shape plus the issue-join gate (D6): a comment on
 * an archived issue is excluded (comments have no archived flag of their
 * own; showing frozen discussion would leak archived work into active
 * search). Returns the issue context each hit needs for its permalink.
 */
export async function rankedCommentHits(
  workspaceId: string,
  query: string,
  limit: number,
): Promise<RankedCommentHit[]> {
  const ts = tsqueryArmFor(query);
  const pattern = toIlikePattern(query);
  if (ts !== null) {
    return prisma.$queryRaw<RankedCommentHit[]>`
      SELECT c.id AS id, ts_rank(c."search_tsv", q) AS rank,
             i."seqNumber" AS "issueSeqNumber", i.title AS "issueTitle"
      FROM "comment" c
      JOIN "issue" i ON i.id = c."issueId"
      CROSS JOIN to_tsquery('english', ${ts}) AS q
      WHERE c."workspaceId" = ${workspaceId}
        AND i."archivedAt" IS NULL
        AND (
          c."search_tsv" @@ q
          OR c."content" ILIKE ${pattern}
        )
      ORDER BY rank DESC, c."updatedAt" DESC, c.id ASC
      LIMIT ${limit}`;
  }
  return prisma.$queryRaw<RankedCommentHit[]>`
    SELECT c.id AS id, 0 AS rank,
           i."seqNumber" AS "issueSeqNumber", i.title AS "issueTitle"
    FROM "comment" c
    JOIN "issue" i ON i.id = c."issueId"
    WHERE c."workspaceId" = ${workspaceId}
      AND i."archivedAt" IS NULL
      AND c."content" ILIKE ${pattern}
    ORDER BY c."updatedAt" DESC, c.id ASC
    LIMIT ${limit}`;
}

/**
 * Member leg (D5) — scoped `ILIKE` over `user.name` only. Email is never a
 * predicate (enumeration risk); member sets are tiny, so no vector
 * machinery and no Better Auth table edits. Name-ascending with
 * deterministic tiebreaks (rule 5). No archived predicate exists for
 * members — departed members simply have no membership row.
 */
export async function searchMemberRows(
  workspaceId: string,
  query: string,
  limit: number,
): Promise<MemberRow[]> {
  const pattern = toIlikePattern(query);
  return prisma.$queryRaw<MemberRow[]>`
    SELECT m.id AS id, m."workspaceId" AS "workspaceId",
           m."userId" AS "userId", u.name AS name, u.email AS email,
           u.image AS image, m.role AS role, m."createdAt" AS "createdAt"
    FROM workspace_member m
    JOIN "user" u ON u.id = m."userId"
    WHERE m."workspaceId" = ${workspaceId}
      AND u.name ILIKE ${pattern}
    ORDER BY u.name ASC, m."createdAt" ASC, m.id ASC
    LIMIT ${limit}`;
}

// ── Identifier fast path (api-design §8.3) ────────────────────────────────

/**
 * Exact `SHIP-###` lookup for the issues leg: workspace-scoped,
 * non-archived, no rank needed. Unknown/deleted/archived numbers return
 * null — the normal ranked legs then run untouched (no error, no special
 * case downstream). Identifiers never touch `search_tsv` — numerals stem
 * poorly (data-model §2.3).
 */
export async function findIssueByIdentifier(
  workspaceId: string,
  seqNumber: number,
) {
  return prisma.issue.findFirst({
    where: { workspaceId, seqNumber, archivedAt: null },
    include: issueInclude(),
  });
}

// ── Hydration (owning includes — card mapping stays single-sourced) ───────

export async function hydrateIssues(workspaceId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.issue.findMany({
    where: { workspaceId, id: { in: ids } },
    include: issueInclude(),
  });
}

export async function hydrateProjects(workspaceId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.project.findMany({
    where: { workspaceId, id: { in: ids } },
    include: projectInclude(workspaceId),
  });
}

export async function hydrateCycles(workspaceId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.cycle.findMany({
    where: { workspaceId, id: { in: ids } },
  });
}

export async function hydrateComments(workspaceId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.comment.findMany({
    where: { workspaceId, id: { in: ids } },
    include: commentInclude(),
  });
}
