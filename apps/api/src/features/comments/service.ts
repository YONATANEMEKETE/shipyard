import type {
  CommentCard,
  CreateCommentRequest,
  DeleteCommentResponse,
  UpdateCommentRequest,
} from '@shipyard/shared';
import { mentionTokenRegex } from '@shipyard/shared';
import { logger } from '../../common/logger/index.js';
import { resolveImageUrl } from '../../common/storage/imageUrl.js';
import { prisma } from '../../common/db/client.js';
import { AppError } from '../../common/errors/AppError.js';
import type { WorkspaceRequestContext } from '../../common/guards/workspace-context.js';
import {
  WorkspaceArchivedError,
  ConfirmationRequiredError,
} from '../workspace/errors.js';
import { IssueArchivedError, IssueNotFoundError } from '../issues/errors.js';
import { CommentNotFoundError, NotCommentAuthorError } from './errors.js';
import {
  commentsRepository,
  type CommentRow,
  type DbClient,
  type MemberSnapshot,
} from './repository.js';
import { notificationsService } from '../notifications/service.js';
import { activityService } from '../activity/service.js';
import type { ListCommentsQuery } from './schemas.js';

/**
 * Comments service — owns the conversation: issue scoping, the archived-issue
 * freeze-all (D9), author-only mutations (no role override), mention
 * parse/resolve/dedup (D6), and the notification-contract calls (create fan-out
 * once, silent recompute on edit, retraction on delete).
 *
 * Writes run inside `$transaction` with guards re-evaluated inside (defense
 * in depth — guards already ran). There is deliberately no
 * `requireWorkspaceRole` anywhere on this module's routes: the write
 * privilege is membership, the mutation privilege is authorship.
 */

const LIST_LIMIT_DEFAULT = 50;

/**
 * Resolve `@tokens` against current members (data-model D6): a token hits a
 * member when it equals (case-insensitive) the full display name or any
 * whitespace-separated word of it. Returns distinct userIds in encounter
 * order — the composite PK would collapse dupes anyway, but resolving once
 * keeps the fan-out list exact. Ambiguous tokens resolve to every matcher
 * (documented: double-notify beats silent-miss until handles exist).
 */
export function resolveMentionedUserIds(
  content: string,
  members: MemberSnapshot[],
): string[] {
  const seen = new Set<string>();
  const resolved: string[] = [];
  const tokens = content.matchAll(mentionTokenRegex);
  for (const match of tokens) {
    const token = match[1];
    if (!token) continue;
    const needle = token.toLowerCase();
    for (const member of members) {
      const words = member.name.toLowerCase().split(/\s+/);
      if (member.name.toLowerCase() === needle || words.includes(needle)) {
        if (!seen.has(member.userId)) {
          seen.add(member.userId);
          resolved.push(member.userId);
        }
      }
    }
  }
  return resolved;
}

// Exported for the search module (F10): grouped hits re-render owning card
// shapes exactly — mapping stays single-sourced here, never duplicated.
export function toCard(row: CommentRow): CommentCard {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    issueId: row.issueId,
    author: {
      userId: row.author.id,
      name: row.author.name,
      email: row.author.email,
      image: resolveImageUrl(row.author.image),
    },
    content: row.content,
    mentions: row.mentions.map((join) => ({
      userId: join.mentionedUser.id,
      name: join.mentionedUser.name,
      image: resolveImageUrl(join.mentionedUser.image),
    })),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function requireComment(row: CommentRow | null): CommentRow {
  if (!row) throw new CommentNotFoundError();
  return row;
}

/** Write-gate reassertion: active workspace (no role check — any member). */
function assertWorkspaceWritable(context: WorkspaceRequestContext): void {
  if (context.status === 'ARCHIVED') throw new WorkspaceArchivedError();
}

function encodeCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursorId(cursor: string): string {
  try {
    const payload = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { id?: unknown };
    if (typeof payload.id !== 'string' || payload.id.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor');
    }
    return payload.id;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor');
  }
}

async function resolveIssue(
  issueId: string,
  context: WorkspaceRequestContext,
): Promise<{
  id: string;
  archivedAt: Date | null;
  seqNumber: number;
  title: string;
}> {
  const issue = await commentsRepository.findIssueScoped(
    prisma,
    issueId,
    context.workspaceId,
  );
  if (!issue) throw new IssueNotFoundError();
  return issue;
}

function assertIssueWritable(issue: { archivedAt: Date | null }): void {
  if (issue.archivedAt) throw new IssueArchivedError();
}

async function resolveComment(
  commentId: string,
  issueId: string,
  context: WorkspaceRequestContext,
): Promise<CommentRow> {
  return requireComment(
    await commentsRepository.findByIdScoped(
      prisma,
      commentId,
      issueId,
      context.workspaceId,
    ),
  );
}

export const commentsService = {
  // ── List (#1, chronological) ───────────────────────────────────────────

  async list(
    context: WorkspaceRequestContext,
    issueId: string,
    query: ListCommentsQuery,
  ): Promise<{ comments: CommentCard[]; nextCursor: string | null }> {
    // Reads stay open on archived issues (existing comments remain visible).
    await resolveIssue(issueId, context);
    const limit = query.limit ?? LIST_LIMIT_DEFAULT;

    let skip: number | undefined;
    let cursor: { id: string } | undefined;
    if (query.cursor !== undefined) {
      const id = decodeCursorId(query.cursor);
      const cursorRow = await prisma.comment.findFirst({
        where: { id, issueId, workspaceId: context.workspaceId },
        select: { id: true },
      });
      if (!cursorRow) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor');
      }
      cursor = { id };
      skip = 1;
    }

    const rows = await commentsRepository.list(prisma, {
      workspaceId: context.workspaceId,
      issueId,
      take: limit + 1,
      ...(skip !== undefined ? { skip } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      comments: page.map(toCard),
      nextCursor: hasMore && last ? encodeCursor({ id: last.id }) : null,
    };
  },

  // ── Detail (#2) ────────────────────────────────────────────────────────

  async getDetail(
    context: WorkspaceRequestContext,
    issueId: string,
    commentId: string,
  ): Promise<CommentCard> {
    return toCard(await resolveComment(commentId, issueId, context));
  },

  /**
   * F9 dashboard contract: batch comment→issue refs for the hub activity
   * feed (no per-item fetch). Comments whose issue is deleted drop out —
   * the feed never renders dead links.
   */
  async resolveIssueRefs(
    workspaceId: string,
    commentIds: string[],
  ): Promise<
    Map<string, { issueId: string; identifier: string; title: string }>
  > {
    const refs = new Map<
      string,
      { issueId: string; identifier: string; title: string }
    >();
    if (commentIds.length === 0) return refs;
    const rows = await commentsRepository.findByIdsScoped(
      prisma,
      workspaceId,
      commentIds,
    );
    for (const row of rows) {
      refs.set(row.id, {
        issueId: row.issue.id,
        identifier: `SHIP-${row.issue.seqNumber}`,
        title: row.issue.title,
      });
    }
    return refs;
  },

  // ── Create (#3, spec §4.1) ─────────────────────────────────────────────

  async create(
    context: WorkspaceRequestContext,
    actorUserId: string,
    issueId: string,
    input: CreateCommentRequest,
  ): Promise<CommentCard> {
    assertWorkspaceWritable(context);
    const issue = await resolveIssue(issueId, context);
    assertIssueWritable(issue);

    const row = await prisma.$transaction(async (tx) => {
      const freshIssue = await commentsRepository.findIssueScoped(
        tx,
        issueId,
        context.workspaceId,
      );
      if (!freshIssue) throw new IssueNotFoundError();
      assertIssueWritable(freshIssue);

      const created = await commentsRepository.create(tx, {
        workspaceId: context.workspaceId,
        issueId,
        authorId: actorUserId,
        content: input.content,
      });

      // Membership snapshot in-tx: a concurrent leave commits first ⇒ the
      // leaver is no longer current ⇒ literal text, no notify (§8.1).
      const members = await commentsRepository.listMemberSnapshot(
        tx,
        context.workspaceId,
      );
      const mentionedUserIds = resolveMentionedUserIds(
        created.content,
        members,
      );
      await commentsRepository.createManyMentions(
        tx,
        mentionedUserIds.map((mentionedUserId) => ({
          commentId: created.id,
          mentionedUserId,
        })),
      );

      // F6 hook: one notification per distinct hit, never for self-mentions
      // (same discipline as F5's same-person-assignee no-op).
      for (const recipientId of mentionedUserIds) {
        if (recipientId === actorUserId) continue;
        await notificationsService.createMention(
          {
            workspaceId: context.workspaceId,
            issueId,
            commentId: created.id,
            recipientId,
            actorId: actorUserId,
          },
          tx,
        );
      }

      // Activity (D7 dual-write): COMMENT_CREATED in the same tx as the
      // row + mention fan-out. Author name is on the created include — no
      // extra lookup. Issue ref frozen from the in-tx issue read.
      const identifier = `SHIP-${freshIssue.seqNumber}`;
      const issueTitle = `${identifier} · ${freshIssue.title}`;
      const commentAuthor = await commentsRepository.findUserName(
        tx,
        actorUserId,
      );
      const actorName = commentAuthor?.name ?? 'Someone';
      await activityService.record(
        {
          workspaceId: context.workspaceId,
          actorId: actorUserId,
          actorName,
          kind: 'COMMENT_CREATED',
          entityType: 'COMMENT',
          entityId: created.id,
          entityTitle: issueTitle,
          summary: `${actorName} commented on ${issueTitle}`,
        },
        tx,
      );

      return requireComment(
        await commentsRepository.findByIdScoped(
          tx,
          created.id,
          issueId,
          context.workspaceId,
        ),
      );
    });

    logger.info(
      {
        workspaceId: context.workspaceId,
        slug: context.slug,
        issueId,
        commentId: row.id,
        authorUserId: actorUserId,
        mentionCount: row.mentions.length,
      },
      'comment.created',
    );
    return toCard(row);
  },

  // ── Update (#4: author-only, silent recompute) ──────────────────────────

  async update(
    context: WorkspaceRequestContext,
    actorUserId: string,
    issueId: string,
    commentId: string,
    input: UpdateCommentRequest,
  ): Promise<CommentCard> {
    assertWorkspaceWritable(context);
    const stored = await resolveComment(commentId, issueId, context);
    // Freeze check before authorship: archived+foreign returns the freeze
    // code, not the authorship code (§6.2).
    const issue = await resolveIssue(issueId, context);
    assertIssueWritable(issue);
    if (stored.authorId !== actorUserId) throw new NotCommentAuthorError();

    // Same-content edit is a no-op: no write, editedAt untouched.
    if (stored.content === input.content) return toCard(stored);

    const row = await prisma.$transaction(async (tx) => {
      const fresh = requireComment(
        await commentsRepository.findByIdScoped(
          tx,
          commentId,
          issueId,
          context.workspaceId,
        ),
      );
      const freshIssue = await commentsRepository.findIssueScoped(
        tx,
        issueId,
        context.workspaceId,
      );
      if (!freshIssue) throw new IssueNotFoundError();
      assertIssueWritable(freshIssue);
      if (fresh.authorId !== actorUserId) throw new NotCommentAuthorError();
      if (fresh.content === input.content) return fresh;

      const updated = await commentsRepository.update(tx, commentId, {
        content: input.content,
        editedAt: new Date(),
      });

      // Recompute joins vs current members (D7) — zero notification writes.
      const members = await commentsRepository.listMemberSnapshot(
        tx,
        context.workspaceId,
      );
      const mentionedUserIds = resolveMentionedUserIds(
        updated.content,
        members,
      );
      await commentsRepository.deleteMentionsForComment(tx, commentId);
      await commentsRepository.createManyMentions(
        tx,
        mentionedUserIds.map((mentionedUserId) => ({
          commentId,
          mentionedUserId,
        })),
      );

      return requireComment(
        await commentsRepository.findByIdScoped(
          tx,
          commentId,
          issueId,
          context.workspaceId,
        ),
      );
    });

    logger.info(
      {
        workspaceId: context.workspaceId,
        issueId,
        commentId,
        actorUserId,
      },
      'comment.updated',
    );
    return toCard(row);
  },

  // ── Delete (#5: author-only, retraction) ────────────────────────────────

  async remove(
    context: WorkspaceRequestContext,
    actorUserId: string,
    issueId: string,
    commentId: string,
    confirm: unknown,
  ): Promise<DeleteCommentResponse> {
    assertWorkspaceWritable(context);
    const stored = await resolveComment(commentId, issueId, context);
    const issue = await resolveIssue(issueId, context);
    assertIssueWritable(issue);
    if (stored.authorId !== actorUserId) throw new NotCommentAuthorError();
    if (confirm !== true) throw new ConfirmationRequiredError();

    await prisma.$transaction(async (tx) => {
      const fresh = requireComment(
        await commentsRepository.findByIdScoped(
          tx,
          commentId,
          issueId,
          context.workspaceId,
        ),
      );
      const freshIssue = await commentsRepository.findIssueScoped(
        tx,
        issueId,
        context.workspaceId,
      );
      if (!freshIssue) throw new IssueNotFoundError();
      assertIssueWritable(freshIssue);
      if (fresh.authorId !== actorUserId) throw new NotCommentAuthorError();

      // Retract mention notifications first (D8 — no dead links), then the
      // row; joins cascade. Siblings, issues, and users untouched.
      await notificationsService.deleteForComment(commentId, tx);
      await commentsRepository.remove(tx, commentId);
      // Activity (D7 dual-write) — D3 proof: COMMENT_DELETED recorded AFTER
      // the row goes. Plain-string target, no FK → survives and renders as
      // frozen text with the issue ref.
      const identifier = `SHIP-${freshIssue.seqNumber}`;
      const issueTitle = `${identifier} · ${freshIssue.title}`;
      const commentAuthor = await commentsRepository.findUserName(
        tx,
        actorUserId,
      );
      const actorName = commentAuthor?.name ?? 'Someone';
      await activityService.record(
        {
          workspaceId: context.workspaceId,
          actorId: actorUserId,
          actorName,
          kind: 'COMMENT_DELETED',
          entityType: 'COMMENT',
          entityId: commentId,
          entityTitle: issueTitle,
          summary: `${actorName} deleted a comment on ${issueTitle}`,
        },
        tx,
      );
    });

    logger.info(
      {
        workspaceId: context.workspaceId,
        issueId,
        commentId,
        actorUserId,
      },
      'comment.deleted',
    );
    return { deletedCommentId: commentId };
  },

  // ── F5 issue-delete contract (issues data-model §6.5/§7) ────────────────
  //
  // Owned by comments, called by issues inside the caller's transaction.
  // Deletes every comment of the issue (joins cascade) plus their mention
  // notifications (D8 chain). Returns the number of comments removed.

  async removeForIssue(issueId: string, tx: DbClient): Promise<number> {
    const rows = await tx.comment.findMany({
      where: { issueId },
      select: { id: true },
    });
    for (const row of rows) {
      await notificationsService.deleteForComment(row.id, tx);
    }
    const removed = await tx.comment.deleteMany({ where: { issueId } });
    if (rows.length > 0) {
      logger.info(
        { issueId, removedComments: removed.count },
        'comment.removed_for_issue',
      );
    }
    return removed.count;
  },
};
