-- CreateEnum
CREATE TYPE "McpTokenScope" AS ENUM ('READ', 'ISSUES_WRITE', 'COMMENTS_WRITE', 'ISSUES_DELETE');

-- CreateTable
CREATE TABLE "mcp_token" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" VARCHAR(12) NOT NULL,
    "scopes" "McpTokenScope"[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_token_tokenHash_key" ON "mcp_token"("tokenHash");

-- CreateIndex
CREATE INDEX "mcp_token_userId_idx" ON "mcp_token"("userId");

-- CreateIndex
CREATE INDEX "mcp_token_workspaceId_idx" ON "mcp_token"("workspaceId");

-- CreateIndex
CREATE INDEX "mcp_token_workspaceId_revokedAt_idx" ON "mcp_token"("workspaceId", "revokedAt");

-- AddForeignKey
ALTER TABLE "mcp_token" ADD CONSTRAINT "mcp_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_token" ADD CONSTRAINT "mcp_token_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
