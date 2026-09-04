-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');

-- AlterEnum
ALTER TYPE "IssueHistoryEvent" ADD VALUE 'CYCLE_CHANGED';

-- AlterTable
ALTER TABLE "issue" ADD COLUMN     "cycleId" TEXT;

-- CreateTable
CREATE TABLE "cycle" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "goal" TEXT,
    "status" "CycleStatus" NOT NULL DEFAULT 'PLANNED',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cycle_workspaceId_idx" ON "cycle"("workspaceId");

-- CreateIndex
CREATE INDEX "cycle_status_idx" ON "cycle"("status");

-- CreateIndex
CREATE INDEX "cycle_archivedAt_idx" ON "cycle"("archivedAt");

-- CreateIndex
CREATE INDEX "cycle_workspaceId_status_idx" ON "cycle"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "issue_cycleId_idx" ON "issue"("cycleId");

-- CreateIndex
CREATE INDEX "issue_workspaceId_cycleId_idx" ON "issue"("workspaceId", "cycleId");

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle" ADD CONSTRAINT "cycle_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- D3: case-insensitive, workspace-scoped cycle name uniqueness (same pattern
-- as project_name_unique / label_name_unique). Archived rows reserve their
-- name; physical delete releases it.
CREATE UNIQUE INDEX "cycle_name_unique"
  ON "cycle"("workspaceId", lower("name"));

-- D5: no overlapping non-archived date ranges per workspace (inclusive
-- bounds — daterange '[]' matches spec §3.1). Requires btree_gist for the
-- workspace_id equality check inside the exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "cycle" ADD CONSTRAINT "cycle_no_overlap"
  EXCLUDE USING gist (
    "workspaceId" WITH =,
    daterange("startDate", "endDate", '[]') WITH &&
  ) WHERE ("archivedAt" IS NULL);

-- D6: at most one ACTIVE non-archived cycle per workspace.
CREATE UNIQUE INDEX "cycle_single_active"
  ON "cycle"("workspaceId") WHERE "status" = 'ACTIVE' AND "archivedAt" IS NULL;
