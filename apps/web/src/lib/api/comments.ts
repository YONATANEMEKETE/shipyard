import type {
  CommentCard,
  CreateCommentRequest,
  DeleteCommentResponse,
  UpdateCommentRequest,
} from '@shipyard/shared';

import { requestJson } from '@/lib/api/request';

// ─────────────────────────────────────────────────────────────────────────────
// Comments API client — the issue conversation (F8)
//
// Browser → Next rewrite → internal API (ADR-003), same envelope discipline as
// issues/projects: success `{ data }`, error `{ error: { code, message } }`.
// Mirrors apps/api/src/features/comments/routes.ts and the contracts in
// packages/shared/src/comments.
// ─────────────────────────────────────────────────────────────────────────────

export class CommentsApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(args: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
    requestId?: string;
  }) {
    super(args.message);
    this.name = 'CommentsApiError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.requestId = args.requestId;
  }
}

function commentsBase(slug: string, issueId: string): string {
  return `/api/v1/workspaces/${encodeURIComponent(slug)}/issues/${encodeURIComponent(issueId)}/comments`;
}

/** Query params mirror listCommentsQuerySchema (limit 1–100, default 50). */
export interface ListCommentsParams {
  limit?: number;
  cursor?: string;
}

/**
 * api-design #1 returns `{ comments, nextCursor }`, but the shared package has
 * no list-response schema for it yet (the API types the page inline), so the
 * shape is declared here rather than guessed into `@shipyard/shared`.
 */
export interface ListCommentsResponse {
  comments: CommentCard[];
  nextCursor: string | null;
}

export function listComments(
  slug: string,
  issueId: string,
  params?: ListCommentsParams,
): Promise<ListCommentsResponse> {
  const query = new URLSearchParams();
  if (params?.limit !== undefined) query.set('limit', String(params.limit));
  if (params?.cursor) query.set('cursor', params.cursor);
  const suffix = query.toString() ? `?${query.toString()}` : '';

  return requestJson<ListCommentsResponse>(
    `${commentsBase(slug, issueId)}${suffix}`,
    { method: 'GET' },
    'Failed to load conversation',
    CommentsApiError,
  );
}

export function createComment(
  slug: string,
  issueId: string,
  body: CreateCommentRequest,
): Promise<CommentCard> {
  return requestJson<CommentCard>(
    commentsBase(slug, issueId),
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to post comment',
    CommentsApiError,
  );
}

function commentUrl(slug: string, issueId: string, commentId: string): string {
  return `${commentsBase(slug, issueId)}/${encodeURIComponent(commentId)}`;
}

/**
 * #4 — full content replacement, author-only server-side. The response is the
 * authoritative card: `editedAt` set and mentions recomputed against current
 * members, with zero re-notification (edits never re-notify, rule 4).
 */
export function updateComment(
  slug: string,
  issueId: string,
  commentId: string,
  body: UpdateCommentRequest,
): Promise<CommentCard> {
  return requestJson<CommentCard>(
    commentUrl(slug, issueId, commentId),
    { method: 'PATCH', body: JSON.stringify(body) },
    'Failed to update comment',
    CommentsApiError,
  );
}

/**
 * #5 — author-only, no tombstone. The row is gone on success, so the response
 * is only the id the client drops from the cached conversation.
 *
 * `confirm: true` is the literal destructive-endpoint contract (same precedent
 * as labels/cycles); omitting it is a 400 CONFIRMATION_REQUIRED.
 */
export function deleteComment(
  slug: string,
  issueId: string,
  commentId: string,
): Promise<DeleteCommentResponse> {
  return requestJson<DeleteCommentResponse>(
    commentUrl(slug, issueId, commentId),
    { method: 'DELETE', body: JSON.stringify({ confirm: true }) },
    'Failed to delete comment',
    CommentsApiError,
  );
}
