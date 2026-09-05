-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('WORKSPACE_CREATED', 'WORKSPACE_UPDATED', 'WORKSPACE_ARCHIVED', 'WORKSPACE_RESTORED', 'MEMBER_INVITED', 'MEMBER_JOINED', 'MEMBER_DECLINED', 'MEMBER_INVITE_REVOKED', 'MEMBER_REMOVED', 'MEMBER_LEFT', 'MEMBER_ROLE_CHANGED', 'OWNERSHIP_TRANSFERRED', 'PROJECT_CREATED', 'PROJECT_RENAMED', 'PROJECT_STATUS_CHANGED', 'PROJECT_OWNER_TRANSFERRED', 'PROJECT_ARCHIVED', 'PROJECT_RESTORED', 'PROJECT_DELETED', 'ISSUE_CREATED', 'ISSUE_STATUS_CHANGED', 'ISSUE_ASSIGNED', 'ISSUE_BLOCKED_SET', 'ISSUE_BLOCKED_CLEARED', 'ISSUE_ARCHIVED', 'ISSUE_RESTORED', 'ISSUE_DELETED', 'COMMENT_CREATED', 'COMMENT_DELETED', 'CYCLE_CREATED', 'CYCLE_STARTED', 'CYCLE_COMPLETED', 'CYCLE_REOPENED', 'CYCLE_ARCHIVED', 'CYCLE_RESTORED', 'CYCLE_DELETED');

-- CreateEnum
CREATE TYPE "ActivityEntityType" AS ENUM ('WORKSPACE', 'MEMBER', 'INVITATION', 'PROJECT', 'ISSUE', 'COMMENT', 'CYCLE');

-- CreateTable
CREATE TABLE "activity_event" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" VARCHAR(255) NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "entityType" "ActivityEntityType" NOT NULL,
    "entityId" TEXT,
    "entityTitle" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_event_workspaceId_idx" ON "activity_event"("workspaceId");

-- CreateIndex
CREATE INDEX "activity_event_workspaceId_createdAt_idx" ON "activity_event"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_event_kind_idx" ON "activity_event"("kind");

-- CreateIndex
CREATE INDEX "activity_event_actorId_idx" ON "activity_event"("actorId");

-- AddForeignKey
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
