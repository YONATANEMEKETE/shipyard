-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ViewScope" AS ENUM ('PROJECT');

-- CreateEnum
CREATE TYPE "ViewType" AS ENUM ('LIST', 'KANBAN');

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "startDate" DATE,
    "targetDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "view_preference" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "ViewScope" NOT NULL,
    "view" "ViewType" NOT NULL DEFAULT 'LIST',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "view_preference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_workspaceId_idx" ON "project"("workspaceId");

-- CreateIndex
CREATE INDEX "project_status_idx" ON "project"("status");

-- CreateIndex
CREATE INDEX "project_ownerId_idx" ON "project"("ownerId");

-- CreateIndex
CREATE INDEX "project_archivedAt_idx" ON "project"("archivedAt");

-- CreateIndex
CREATE INDEX "view_preference_workspaceId_idx" ON "view_preference"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "view_preference_workspaceId_userId_scope_key" ON "view_preference"("workspaceId", "userId", "scope");

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_preference" ADD CONSTRAINT "view_preference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_preference" ADD CONSTRAINT "view_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Functional unique index: case-insensitive, workspace-scoped name uniqueness
-- (data-model.md D3). Prisma cannot express functional indexes, so this ships
-- as raw SQL in the same migration (same pattern as workspace_single_owner and
-- invitation_single_pending). Names are trimmed server-side before persist;
-- permanent delete physically removes the row, so every non-deleted row
-- participates and deleting frees the name for reuse automatically.
CREATE UNIQUE INDEX "project_name_unique"
  ON "project"("workspaceId", lower("name"));
