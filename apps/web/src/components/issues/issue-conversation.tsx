'use client';

import { format } from 'date-fns';
import {
  AtSign,
  ChevronDown,
  MessageSquare,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import {
  mentionTokenMatches,
  mentionTokenRegex,
  type CommentCard,
  type CommentMentionCard,
} from '@shipyard/shared';
import { StatefulButton } from '@/components/motion/button/stateful';
import { DeleteCommentDialog } from '@/components/issues/delete-comment-dialog';
import {
  MentionField,
  mentionFieldFrameFocusClass,
} from '@/components/issues/mention-field';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

const AVATAR_TONES = [
  'bg-ds-brand',
  'bg-ds-info',
  'bg-ds-warning',
  'bg-ds-success',
] as const;

function toneFor(userId: string): (typeof AVATAR_TONES)[number] {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1)
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

/**
 * Chip label: first name, a dot, then the first letter of the second name
 * ("yonatanem.m"). Lowercased — the chip reads as a handle, not a salutation.
 * A single-word name has no second word to take a letter from, so it is used
 * alone.
 */
function shortName(name: string): string {
  const [first, second] = name.trim().split(/\s+/).filter(Boolean);
  if (!first) return name;
  return second ? `${first}.${second[0]}`.toLowerCase() : first.toLowerCase();
}

/**
 * Resolves one written token against the card's `mentions[]`, using the same
 * rule the API resolved the row with (data-model D6): case-insensitive match on
 * the full display name, any whitespace-separated word of it, or the dashed
 * name slug the composer writes for members who share a first name. An
 * unmatched token is not a mention — it renders as the literal text the author
 * typed (D3), which is also what happens when a mentioned user has been
 * deleted.
 */
function resolveMention(
  token: string,
  mentions: CommentMentionCard[],
): CommentMentionCard | undefined {
  return mentions.find((mention) => mentionTokenMatches(token, mention.name));
}

function MentionChip({ mention }: { mention: CommentMentionCard }) {
  return (
    <span
      // Inline chip inside one flowing paragraph — the design's "chip + first
      // words share line 1" is a .pen limitation, not the intended markup.
      // align-middle centres the chip's text on the paragraph text's optical
      // middle (measured within 1px); a px offset drifts with line height.
      className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-ds-brand-soft px-[7px] align-middle text-[11px] font-semibold leading-none text-ds-brand"
      title={mention.name}
    >
      @{shortName(mention.name)}
    </span>
  );
}

/**
 * Comment body — one paragraph with mention chips inline. Splits on the shared
 * mention grammar rather than on the design's visual line break, so a mention
 * mid-sentence stays mid-sentence.
 */
function CommentBody({ comment }: { comment: CommentCard }) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of comment.content.matchAll(mentionTokenRegex)) {
    const raw = match[0];
    const index = match.index;
    const mention = resolveMention(match[1]!, comment.mentions);
    parts.push(comment.content.slice(cursor, index));
    parts.push(
      mention ? (
        <MentionChip key={`${index}-${raw}`} mention={mention} />
      ) : (
        // Unknown handle (or a deleted member) stays literal text.
        raw
      ),
    );
    cursor = index + raw.length;
  }
  parts.push(comment.content.slice(cursor));

  return (
    <p className="whitespace-pre-wrap text-[12.5px] leading-[1.5] text-foreground">
      {parts}
    </p>
  );
}

/**
 * The author's own row actions — hidden until the comment's content is hovered
 * or something inside it takes focus, so the thread reads as prose until you
 * reach for it. They keep their space while hidden (opacity, not display), so
 * revealing them never nudges the timestamp.
 *
 * This is a convenience, not a permission: the API re-asserts authorship on
 * both routes and roles never override it (spec rule 3).
 */
function CommentActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const buttonClass =
    'grid size-6 shrink-0 place-items-center rounded-md border border-transparent text-ds-text-muted transition-all duration-150 focus-visible:outline-none active:scale-95';
  const editClass =
    'hover:border-ds-border hover:bg-ds-surface hover:text-foreground focus-visible:border-ds-border focus-visible:bg-ds-surface focus-visible:text-foreground';
  const deleteClass =
    'hover:border-ds-danger/30 hover:bg-ds-danger-soft hover:text-ds-danger focus-visible:border-ds-danger/30 focus-visible:bg-ds-danger-soft focus-visible:text-ds-danger';

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/comment:opacity-100 group-focus-within/comment:opacity-100">
      {/* One provider for the pair, so moving between the two icons skips the
          delay instead of waiting it out twice. */}
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit comment"
              className={cn(buttonClass, editClass)}
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Edit comment</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete comment"
              className={cn(buttonClass, deleteClass)}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Delete comment</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function CommentEntry({
  comment,
  slug,
  isOwn,
  readOnly,
  onEditComment,
  onRequestDelete,
}: {
  comment: CommentCard;
  slug: string;
  isOwn: boolean;
  readOnly: boolean;
  onEditComment?: (commentId: string, content: string) => Promise<unknown>;
  onRequestDelete: (comment: CommentCard) => void;
}) {
  const { author } = comment;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [saving, setSaving] = useState(false);

  const next = draft.trim();
  // A same-content body is a server-side no-op (api-design #4), so the action
  // stays off until something actually changed — no accidental "(edited)".
  const canSave = next !== '' && next !== comment.content.trim() && !saving;

  const startEdit = () => {
    setDraft(comment.content);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(comment.content);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onEditComment?.(comment.id, next);
      setEditing(false);
    } catch {
      // Swallowed on purpose — the page surfaces the failure and the draft
      // stays in the field so nothing the author wrote is lost.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      id={`comment-${comment.id}`}
      data-slot="comment"
      className="flex w-full gap-2.5 rounded-lg p-2 scroll-mt-4"
    >
      {author.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={author.image}
          alt=""
          className="size-[26px] shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className={cn(
            'grid size-[26px] shrink-0 place-items-center rounded-full font-mono text-[9px] font-bold text-white',
            toneFor(author.userId),
          )}
          aria-label={author.name}
          title={author.name}
        >
          {initialsOf(author.name)}
        </span>
      )}

      <div className="group/comment flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex w-full items-center gap-2">
          <span className="shrink-0 text-[12.5px] font-semibold leading-none text-foreground">
            {author.name}
          </span>
          <span className="shrink-0 text-[11px] leading-none text-ds-text-muted">
            {format(new Date(comment.createdAt), 'MMM d, HH:mm')}
            {comment.editedAt ? ' (edited)' : ''}
          </span>
          {isOwn && !readOnly && !editing ? (
            <CommentActions
              onEdit={startEdit}
              onDelete={() => onRequestDelete(comment)}
            />
          ) : null}
        </div>

        {editing ? (
          // Editing happens in place, in the same bordered container as the
          // composer, so the field (and its @ suggestions) is unchanged between
          // writing a comment and fixing one.
          <div
            className={cn(
              'flex w-full flex-col gap-2.5 rounded-lg border border-ds-border bg-ds-surface px-3 py-2.5',
              mentionFieldFrameFocusClass,
            )}
          >
            <MentionField
              slug={slug}
              value={draft}
              onChange={setDraft}
              ariaLabel="Edit your comment"
              autoFocus
              onSubmit={() => void save()}
              suggestAbove={false}
            />
            <div className="flex w-full items-center justify-end gap-2">
              <span className="mr-auto flex items-center gap-1 text-[11px] leading-none text-ds-text-muted">
                <AtSign aria-hidden className="size-3 shrink-0" />
                Mention members with @
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={cancelEdit}
                disabled={saving}
                className="h-[26px] gap-1.5 rounded-md px-2.5 text-xs font-medium text-ds-text-muted hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden />
                Cancel
              </Button>
              <StatefulButton
                type="button"
                size="sm"
                onClick={() => void save()}
                state={saving ? 'loading' : 'idle'}
                loadingText="Saving…"
                disabled={!canSave}
                className="h-[26px] rounded-md bg-ds-brand px-3 text-xs font-semibold text-white hover:bg-ds-brand/90 disabled:opacity-50"
              >
                Save
              </StatefulButton>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              // Only the comment's own container reacts to the pointer — the
              // avatar, name and timestamp stay inert. The hairline lives at
              // rest so the bubble never changes size when it appears, and
              // px/py are 1px tighter to pay for it.
              'flex w-full flex-col rounded-lg border border-transparent bg-ds-surface-subtle px-[11px] py-[9px] transition-colors duration-150',
              'hover:border-ds-border hover:bg-ds-surface',
            )}
          >
            <CommentBody comment={comment} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Issue Conversation — mirrors "Conversation Panel" in
 * Screen / Issues - Detail / Conversation (shipyard.pen): the comment thread
 * as avatar + "<Author> <time>" over a surface-subtle bubble, with resolved
 * mentions rendered as inline brand chips.
 *
 * Comments arrive oldest-first (api-design #1, matching the history panel's
 * chronology) so the newest sits next to the composer. The pen's bubble note
 * says "newest first"; the API contract wins — flagged rather than guessed at.
 *
 * Pagination: the API's cursor walks forward from the OLDEST comment (#1 —
 * "chronological, oldest first"), so the control sits after the rendered
 * comments and each click appends NEWER ones — newest last, next to the
 * composer. It reads like the history panel's control, mirrored downwards.
 *
 * Authorship: the viewer's own rows reveal edit / delete-with-confirm on hover.
 * The page owns the mutations (they carry the toasts and the cache writes);
 * this component only knows how to open an editor and ask for a confirmation.
 */
export function IssueConversation({
  comments,
  slug,
  viewerId,
  readOnly = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onEditComment,
  onDeleteComment,
}: {
  comments: CommentCard[];
  /** Directory slug — the inline editor's mention suggestions come from it. */
  slug: string;
  /** Better Auth id of the viewer; own rows are the only ones with actions. */
  viewerId?: string;
  /** Archived issues freeze every comment write (spec §3.6) — actions hide. */
  readOnly?: boolean;
  /** Older pages remain on the server. */
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onEditComment?: (commentId: string, content: string) => Promise<unknown>;
  onDeleteComment?: (commentId: string) => Promise<unknown>;
}) {
  // One dialog for the whole thread, not one per comment.
  const [deleteTarget, setDeleteTarget] = useState<CommentCard | null>(null);

  // Mention notifications deep-link to #comment-<id>. The browser resolves the
  // hash before the thread is in the DOM, so re-run the scroll whenever the
  // comment list changes — first page, then each "show more".
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#comment-')) return;
    document
      .getElementById(hash.slice(1))
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [comments]);

  if (comments.length === 0) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <EmptyState
          icon={MessageSquare}
          title="No conversation yet"
          description="Ask a question or leave context — comments show up here."
        />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      {comments.map((comment) => (
        <CommentEntry
          key={comment.id}
          comment={comment}
          slug={slug}
          isOwn={Boolean(viewerId) && comment.author.userId === viewerId}
          readOnly={readOnly}
          onEditComment={onEditComment}
          onRequestDelete={setDeleteTarget}
        />
      ))}

      {/* Manual pagination — newer comments arrive on click, appended below
          the ones already read. */}
      {hasMore ? (
        <div className="flex w-full items-center justify-center py-3">
          <StatefulButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onLoadMore?.()}
            state={isLoadingMore ? 'loading' : 'idle'}
            loadingText="Loading…"
            icon={<ChevronDown aria-hidden className="size-3.5" />}
            className="gap-1.5 rounded-md border border-ds-border bg-ds-surface text-[11.5px] font-semibold text-foreground hover:bg-ds-bg hover:text-foreground"
          >
            Show more comments
          </StatefulButton>
        </div>
      ) : null}

      <DeleteCommentDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        comment={deleteTarget}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await onDeleteComment?.(deleteTarget.id);
        }}
      />
    </div>
  );
}
