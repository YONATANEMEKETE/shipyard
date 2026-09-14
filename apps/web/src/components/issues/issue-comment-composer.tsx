'use client';

import { AtSign } from 'lucide-react';
import { useState } from 'react';

import { StatefulButton } from '@/components/motion/button/stateful';
import {
  MentionField,
  mentionFieldFrameFocusClass,
} from '@/components/issues/mention-field';
import { useSession } from '@/hooks/use-session';
import { cn } from '@/lib/utils';

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/**
 * Comment composer — mirrors "Comment Composer" in
 * Screen / Issues - Detail / Conversation (shipyard.pen): the viewer's 26px
 * avatar beside a bordered field (placeholder "Leave a comment…") whose footer
 * row carries the '@' hint and the primary "Comment" action, disabled until
 * there's something to send.
 *
 * The field itself (suggestion list, caret, handle insertion) is `MentionField`
 * — shared with the inline comment editor, so posting and editing resolve
 * mentions identically. The server re-parses the text on write, so the mention
 * itself is not sent from here.
 *
 * Posting: `onSubmit` may return a promise (the create hook does). The draft
 * clears only once it resolves — a rejected post keeps the text so nothing the
 * author wrote is lost to a 409/500 — and the action shows the pending beat
 * while it is in flight.
 */
export function IssueCommentComposer({
  slug,
  /** Archived issues are read-only (spec §3.6) — the field locks instead. */
  disabled = false,
  onSubmit,
}: {
  slug: string;
  disabled?: boolean;
  onSubmit?: (body: string) => void | Promise<unknown>;
}) {
  const { data: session } = useSession();
  const [value, setValue] = useState('');
  const [posting, setPosting] = useState(false);

  const trimmed = value.trim();
  const canSubmit = trimmed !== '' && !disabled;
  const user = session?.user;

  const submit = async () => {
    if (!canSubmit || posting) return;
    setPosting(true);
    try {
      await onSubmit?.(trimmed);
      // Cleared only on success: the page surfaces the error and the draft
      // stays put for a retry.
      setValue('');
    } catch {
      // Swallowed on purpose — the mutation's onError owns the message.
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="flex w-full shrink-0 gap-2.5">
      {user?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.image}
          alt=""
          className="size-[26px] shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className="grid size-[26px] shrink-0 place-items-center rounded-full bg-ds-brand font-mono text-[9px] font-bold text-white"
          aria-hidden
        >
          {initialsOf(user?.name ?? '')}
        </span>
      )}

      <div
        className={cn(
          'relative flex min-w-0 flex-1 flex-col rounded-md border border-ds-border bg-ds-surface-subtle px-3 py-2.5',
          mentionFieldFrameFocusClass,
          'focus-within:bg-ds-surface',
        )}
      >
        <div className="flex flex-col gap-2.5">
          <MentionField
            slug={slug}
            value={value}
            onChange={setValue}
            disabled={disabled}
            ariaLabel="Leave a comment"
            onSubmit={() => void submit()}
            placeholder={
              disabled ? 'Archived issues are read-only' : 'Leave a comment…'
            }
          />

          {/* Hint row — the '@' affordance the design spells out, then the
              primary action. */}
          <div className="flex w-full items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-[11px] leading-none text-ds-text-muted">
              <AtSign aria-hidden className="size-3 shrink-0" />
              Mention members with @
            </span>
            <StatefulButton
              type="button"
              size="sm"
              onClick={() => void submit()}
              state={posting ? 'loading' : 'idle'}
              loadingText="Posting…"
              disabled={!canSubmit}
              className={cn(
                'h-[26px] rounded-md bg-ds-brand px-3 text-xs font-semibold text-white hover:bg-ds-brand/90 disabled:opacity-50',
              )}
            >
              Comment
            </StatefulButton>
          </div>
        </div>
      </div>
    </div>
  );
}
