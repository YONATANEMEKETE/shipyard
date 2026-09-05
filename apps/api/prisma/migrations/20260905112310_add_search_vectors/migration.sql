-- ── Search (F10) ───────────────────────────────────────────────────────────
-- Generated tsvector columns + GIN indexes over four content tables owned by
-- other modules (issues F5, projects F4, cycles F7, comments F8). Raw SQL
-- append: the migration owns the columns, and reads go through typed
-- $queryRaw in features/search (data-model.md §2, D1/D2).
--
-- GENERATED ALWAYS ... STORED: the database owns freshness transactionally
-- (a title edit and its lexemes commit atomically — D1). ALTER TABLE
-- backfills existing rows inline and no triggers/backfill jobs exist.
-- coalesce keeps nullable bodies (description / goal) from nulling the whole
-- vector. Weights are generation-time constants (D3): title/name = A,
-- description/goal/content = B, so a term in a title outranks the same term
-- buried in a body with zero per-query cost.
--
-- The matching schema.prisma fields are declared Unsupported("tsvector")
-- (D2) purely so `migrate dev` drift detection ignores the columns —
-- Prisma Client never surfaces them and nothing may write them.

-- Issues: title outranks description (D3)
ALTER TABLE "issue" ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED NOT NULL;
CREATE INDEX "issue_search_gin" ON "issue" USING GIN ("search_tsv");

-- Projects: name outranks description
ALTER TABLE "project" ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED NOT NULL;
CREATE INDEX "project_search_gin" ON "project" USING GIN ("search_tsv");

-- Cycles: name outranks goal
ALTER TABLE "cycle" ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("goal", '')), 'B')
  ) STORED NOT NULL;
CREATE INDEX "cycle_search_gin" ON "cycle" USING GIN ("search_tsv");

-- Comments: body only (single weight — no title field exists)
ALTER TABLE "comment" ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("content", '')), 'B')
  ) STORED NOT NULL;
CREATE INDEX "comment_search_gin" ON "comment" USING GIN ("search_tsv");
