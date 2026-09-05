-- CreateTable
CREATE TABLE "issue_view" (
    "userId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_view_pkey" PRIMARY KEY ("userId","issueId")
);

-- CreateIndex
CREATE INDEX "issue_view_userId_idx" ON "issue_view"("userId");

-- CreateIndex
CREATE INDEX "issue_view_userId_workspaceId_viewedAt_idx" ON "issue_view"("userId", "workspaceId", "viewedAt");

-- AddForeignKey
ALTER TABLE "issue_view" ADD CONSTRAINT "issue_view_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_view" ADD CONSTRAINT "issue_view_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_view" ADD CONSTRAINT "issue_view_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
