-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ASSIGNMENT', 'MENTION');

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT,
    "issueId" TEXT NOT NULL,
    "commentId" TEXT,
    "type" "NotificationType" NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_workspaceId_idx" ON "notification"("workspaceId");

-- CreateIndex
CREATE INDEX "notification_recipientId_idx" ON "notification"("recipientId");

-- CreateIndex
CREATE INDEX "notification_recipientId_createdAt_idx" ON "notification"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_issueId_idx" ON "notification"("issueId");

-- CreateIndex
CREATE INDEX "notification_commentId_idx" ON "notification"("commentId");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- D7: unread badge-poll hot path — partial index over unread rows only
-- (same raw-SQL pattern as workspace_single_owner / cycle_single_active).
CREATE INDEX "notification_unread_idx"
  ON "notification"("recipientId", "createdAt" DESC) WHERE "readAt" IS NULL;
