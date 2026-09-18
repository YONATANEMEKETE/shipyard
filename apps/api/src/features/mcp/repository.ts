import { prisma } from '../../common/db/client.js';
import type { Prisma } from '../../generated/client.js';

/**
 * MCP repository — Prisma access only. No business decisions live here.
 *
 * Workspace-scoped callers pass `workspaceId` explicitly (no implicit
 * context), and every lookup that can be reached by a member carries the
 * scope it is allowed to see, so a foreign id can never resolve.
 */

export type DbClient = Prisma.TransactionClient | typeof prisma;

const tokenCardSelect = {
  id: true,
  workspaceId: true,
  userId: true,
  label: true,
  tokenPrefix: true,
  scopes: true,
  expiresAt: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
} satisfies Prisma.McpTokenSelect;

/** Row shape returned by every token query (never includes `tokenHash`). */
export type McpTokenRow = Prisma.McpTokenGetPayload<{
  select: typeof tokenCardSelect;
}>;

export interface CreateMcpTokenArgs {
  userId: string;
  workspaceId: string;
  label: string;
  tokenHash: string;
  tokenPrefix: string;
  scopes: Prisma.McpTokenCreateInput['scopes'];
  expiresAt: Date | null;
}

export const mcpTokensRepository = {
  create(client: DbClient, data: CreateMcpTokenArgs) {
    return client.mcpToken.create({
      data: {
        userId: data.userId,
        workspaceId: data.workspaceId,
        label: data.label,
        tokenHash: data.tokenHash,
        tokenPrefix: data.tokenPrefix,
        scopes: data.scopes,
        expiresAt: data.expiresAt,
      },
      select: tokenCardSelect,
    });
  },

  /** A member's own connections, newest first. */
  listForUser(client: DbClient, workspaceId: string, userId: string) {
    return client.mcpToken.findMany({
      where: { workspaceId, userId },
      select: tokenCardSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  },

  /** Every connection in the workspace — Owner/Admin visibility (api-design §2 #3). */
  listForWorkspace(client: DbClient, workspaceId: string) {
    return client.mcpToken.findMany({
      where: { workspaceId },
      select: tokenCardSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  },

  /** Scoped by workspace: an id from another workspace simply does not match. */
  findByIdScoped(client: DbClient, id: string, workspaceId: string) {
    return client.mcpToken.findFirst({
      where: { id, workspaceId },
      select: tokenCardSelect,
    });
  },

  /**
   * The `/mcp` auth lookup (M4): the unique hash index is the hot path, and it
   * deliberately reads the row *with* its hash so the caller can compare
   * nothing and simply trust the match. This is the only query that may select
   * `tokenHash`.
   */
  findByHash(client: DbClient, tokenHash: string) {
    return client.mcpToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        workspaceId: true,
        scopes: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
      },
    });
  },

  revoke(client: DbClient, id: string, revokedAt: Date) {
    return client.mcpToken.update({
      where: { id },
      data: { revokedAt },
      select: tokenCardSelect,
    });
  },

  /**
   * Hard delete — the row and its hash are gone, so the credential can never
   * resolve again and it finally leaves the member's list. Scoping is the
   * caller's job: the service resolves the row through `findByIdScoped` first,
   * so a foreign id never reaches this query.
   */
  remove(client: DbClient, id: string) {
    return client.mcpToken.delete({
      where: { id },
      select: tokenCardSelect,
    });
  },
};
