-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "IssuePriority" AS ENUM ('NO_PRIORITY', 'URGENT', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "IssueHistoryEvent" AS ENUM ('CREATED', 'STATUS_CHANGED', 'BLOCKED_SET', 'BLOCKED_CLEARED', 'ASSIGNED', 'UNASSIGNED', 'PRIORITY_CHANGED', 'PROJECT_CHANGED', 'DUE_DATE_CHANGED', 'TITLE_CHANGED', 'ARCHIVED', 'RESTORED', 'LABEL_ADDED', 'LABEL_REMOVED');

-- AlterEnum
ALTER TYPE "ViewScope" ADD VALUE 'ISSUE';

-- CreateTable
CREATE TABLE "issue" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "seqNumber" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" "IssueStatus" NOT NULL DEFAULT 'BACKLOG',
    "priority" "IssuePriority" NOT NULL DEFAULT 'NO_PRIORITY',
    "assigneeId" TEXT,
    "creatorId" TEXT NOT NULL,
    "projectId" TEXT,
    "dueDate" DATE,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" VARCHAR(500),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "label" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_label" (
    "issueId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_label_pkey" PRIMARY KEY ("issueId","labelId")
);

-- CreateTable
CREATE TABLE "issue_history" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "actorId" TEXT,
    "event" "IssueHistoryEvent" NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_issue_sequence" (
    "workspaceId" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "workspace_issue_sequence_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateIndex
CREATE INDEX "issue_workspaceId_idx" ON "issue"("workspaceId");

-- CreateIndex
CREATE INDEX "issue_status_idx" ON "issue"("status");

-- CreateIndex
CREATE INDEX "issue_priority_idx" ON "issue"("priority");

-- CreateIndex
CREATE INDEX "issue_assigneeId_idx" ON "issue"("assigneeId");

-- CreateIndex
CREATE INDEX "issue_creatorId_idx" ON "issue"("creatorId");

-- CreateIndex
CREATE INDEX "issue_projectId_idx" ON "issue"("projectId");

-- CreateIndex
CREATE INDEX "issue_dueDate_idx" ON "issue"("dueDate");

-- CreateIndex
CREATE INDEX "issue_blocked_idx" ON "issue"("blocked");

-- CreateIndex
CREATE INDEX "issue_archivedAt_idx" ON "issue"("archivedAt");

-- CreateIndex
CREATE INDEX "issue_workspaceId_status_idx" ON "issue"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "issue_workspaceId_assigneeId_idx" ON "issue"("workspaceId", "assigneeId");

-- CreateIndex
CREATE INDEX "issue_workspaceId_projectId_idx" ON "issue"("workspaceId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "issue_workspaceId_seqNumber_key" ON "issue"("workspaceId", "seqNumber");

-- CreateIndex
CREATE INDEX "label_workspaceId_idx" ON "label"("workspaceId");

-- CreateIndex
CREATE INDEX "issue_label_labelId_idx" ON "issue_label"("labelId");

-- CreateIndex
CREATE INDEX "issue_history_workspaceId_idx" ON "issue_history"("workspaceId");

-- CreateIndex
CREATE INDEX "issue_history_issueId_idx" ON "issue_history"("issueId");

-- CreateIndex
CREATE INDEX "issue_history_actorId_idx" ON "issue_history"("actorId");

-- CreateIndex
CREATE INDEX "issue_history_issueId_createdAt_idx" ON "issue_history"("issueId", "createdAt");

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label" ADD CONSTRAINT "label_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_label" ADD CONSTRAINT "issue_label_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_label" ADD CONSTRAINT "issue_label_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "label"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_history" ADD CONSTRAINT "issue_history_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_history" ADD CONSTRAINT "issue_history_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_history" ADD CONSTRAINT "issue_history_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_issue_sequence" ADD CONSTRAINT "workspace_issue_sequence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
