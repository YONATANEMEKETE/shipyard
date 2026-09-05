import { prisma } from '../../common/db/client.js';
import type { Prisma } from '../../generated/client.js';

/**
 * Comments repository — Prisma access only. No business decisions live here.
 * All workspace-scoped callers pass workspaceId explicitly; no implicit
 * context. Transaction-aware overloads accept an explicit `tx` client.
 */

export type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Full comment graph for card mapping in one query (no N+1): author card +
 * mention joins with mentioned-user profiles in encounter order.
 */
export function commentInclude() {
  return {
    author: { select: { id: true, name: true, email: true, image: true } },
    mentions: {
      include: {
        mentionedUser: {
          select: { id: true, name: true, image: true },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { mentionedUserId: 'asc' }],
    },
  } satisfies Prisma.CommentInclude;
}

/** Row shape returned by every comment query (via {@link commentInclude}). */
export type CommentRow = Prisma.CommentGetPayload<{
  include: ReturnType<typeof commentInclude>;
}>;

export interface ListCommentsArgs {
  workspaceId: string;
  issueId: string;
  take: number;
  skip?: number;
  cursor?: { id: string };
}

export interface MemberSnapshot {
  userId: string;
  name: string;
}

export const commentsRepository = {
  list(client: DbClient, args: ListCommentsArgs) {
    return client.comment.findMany({
      where: { workspaceId: args.workspaceId, issueId: args.issueId },
      include: commentInclude(),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: args.take,
      ...(args.skip !== undefined ? { skip: args.skip } : {}),
      ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
    });
  },

  /** Triple-scoped lookup: id + issueId + workspaceId (no cross-issue leak). */
  findByIdScoped(
    client: DbClient,
    id: string,
    issueId: string,
    workspaceId: string,
  ) {
    return client.comment.findFirst({
      where: { id, issueId, workspaceId },
      include: commentInclude(),
    });
  },

  /** Actor display name frozen at emit time (activity D4/D5). */
  findUserName(client: DbClient, userId: string) {
    return client.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
  },

  findIssueScoped(client: DbClient, issueId: string, workspaceId: string) {
    return client.issue.findFirst({
      where: { id: issueId, workspaceId },
      select: {
        id: true,
        archivedAt: true,
        seqNumber: true,
        title: true,
      },
    });
  },

  create(
    client: DbClient,
    data: {
      workspaceId: string;
      issueId: string;
      authorId: string;
      content: string;
    },
  ) {
    return client.comment.create({ data, include: commentInclude() });
  },

  update(
    client: DbClient,
    id: string,
    data: { content: string; editedAt: Date },
  ) {
    return client.comment.update({
      where: { id },
      data,
      include: commentInclude(),
    });
  },

  remove(client: DbClient, id: string) {
    return client.comment.delete({ where: { id } });
  },

  // ── Mention joins ──────────────────────────────────────────────────────

  createManyMentions(
    client: DbClient,
    rows: Array<{ commentId: string; mentionedUserId: string }>,
  ) {
    if (rows.length === 0) return Promise.resolve({ count: 0 });
    return client.commentMention.createMany({ data: rows });
  },

  deleteMentionsForComment(client: DbClient, commentId: string) {
    return client.commentMention.deleteMany({ where: { commentId } });
  },

  countMentionsForComment(client: DbClient, commentId: string) {
    return client.commentMention.count({ where: { commentId } });
  },

  // ── Mention resolution snapshot ────────────────────────────────────────
  //
  // Current workspace members with display names, read in-tx so a concurrent
  // leave during post cannot notify a leaver (§8.1).

  listMemberSnapshot(
    client: DbClient,
    workspaceId: string,
  ): Promise<MemberSnapshot[]> {
    return client.workspaceMember
      .findMany({
        where: { workspaceId },
        select: { userId: true, user: { select: { name: true } } },
      })
      .then((rows) =>
        rows.map((row) => ({ userId: row.userId, name: row.user.name })),
      );
  },
};

export type CommentsRepository = typeof commentsRepository;
