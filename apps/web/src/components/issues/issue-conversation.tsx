'use client';

import { format } from 'date-fns';
import { ChevronDown, MessageSquare } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  mentionTokenMatches,
  mentionTokenRegex,
  type CommentCard,
  type CommentMentionCard,
} from '@shipyard/shared';
import { StatefulButton } from '@/components/motion/button/stateful';
import { EmptyState } from '@/components/ui/empty-state';
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

function CommentEntry({ comment }: { comment: CommentCard }) {
  const { author } = comment;
  return (
    <div className="flex w-full gap-2.5 rounded-lg p-2">
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

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex w-full items-center gap-2">
          <span className="shrink-0 text-[12.5px] font-semibold leading-none text-foreground">
            {author.name}
          </span>
          <span className="shrink-0 text-[11px] leading-none text-ds-text-muted">
            {format(new Date(comment.createdAt), 'MMM d, HH:mm')}
            {comment.editedAt ? ' (edited)' : ''}
          </span>
        </div>

        <div className="flex w-full flex-col rounded-lg bg-ds-surface-subtle px-3 py-2.5">
          <CommentBody comment={comment} />
        </div>
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
 * Author-only hover actions (edit / delete-with-confirm) are not built yet.
 */
export function IssueConversation({
  comments,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: {
  comments: CommentCard[];
  /** Older pages remain on the server. */
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}) {
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
        <CommentEntry key={comment.id} comment={comment} />
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
    </div>
  );
}
