-- CreateTable
CREATE TABLE "comment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_mention" (
    "commentId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_mention_pkey" PRIMARY KEY ("commentId","mentionedUserId")
);

-- CreateIndex
CREATE INDEX "comment_workspaceId_idx" ON "comment"("workspaceId");

-- CreateIndex
CREATE INDEX "comment_issueId_idx" ON "comment"("issueId");

-- CreateIndex
CREATE INDEX "comment_authorId_idx" ON "comment"("authorId");

-- CreateIndex
CREATE INDEX "comment_issueId_createdAt_idx" ON "comment"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "comment_mention_mentionedUserId_idx" ON "comment_mention"("mentionedUserId");

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_mention" ADD CONSTRAINT "comment_mention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_mention" ADD CONSTRAINT "comment_mention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
