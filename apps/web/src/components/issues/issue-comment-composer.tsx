'use client';

import { AtSign } from 'lucide-react';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { StatefulButton } from '@/components/motion/button/stateful';
import { useMembers } from '@/hooks/use-members';
import { useSession } from '@/hooks/use-session';
import { cn } from '@/lib/utils';
import { mentionHandleFor, mentionSlug } from '@shipyard/shared';

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

/** Grows with the text, then scrolls — the field never eats the thread. */
const MAX_FIELD_HEIGHT = 200;

/** How many suggestions the popup shows at once. */
const MAX_SUGGESTIONS = 5;

/**
 * The `@token` under the caret — one word, no spaces, which is exactly the
 * grammar the API resolves against (`mentionTokenRegex`, data-model D6), so
 * anything inserted here is a handle the server can match.
 */
const MENTION_QUERY = /(?:^|\s)@([A-Za-z0-9_.-]*)$/;

function readMention(value: string, caret: number) {
  const match = MENTION_QUERY.exec(value.slice(0, caret));
  if (!match) return null;
  const query = match[1]!;
  return { start: caret - query.length - 1, query };
}

/**
 * Comment composer — mirrors "Comment Composer" in
 * Screen / Issues - Detail / Conversation (shipyard.pen): the viewer's 26px
 * avatar beside a bordered field (placeholder "Leave a comment…") whose footer
 * row carries the '@' hint and the primary "Comment" action, disabled until
 * there's something to send.
 *
 * The field is a textarea — one row at rest, growing with the text up to 200px
 * — so a multi-line comment is written in place rather than in a single-line
 * input.
 *
 * Mentions: typing '@' opens a member list over the field, filtered as you
 * type (the directory is `GET …/members`, filtered client-side — there is no
 * suggestion endpoint, by contract). ↑/↓ move, Enter/Tab or click inserts
 * `@handle ` and closes, Escape dismisses. The server re-parses the text on
 * write, so the mention itself is not sent from here.
 *
 * The viewer is never offered: a self-mention resolves server-side to a join
 * row with no notification (api-design §6.3), so it is a no-op the composer
 * has no reason to suggest.
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
  const { data: membersData } = useMembers(slug);
  const [value, setValue] = useState('');
  const [mention, setMention] = useState<{
    start: number;
    query: string;
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [posting, setPosting] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  /** Caret to restore once the next value lands in the DOM. */
  const pendingCaret = useRef<number | null>(null);
  const listId = useId();

  // Runs after React has written the new value, so the caret is restored in the
  // same commit — a rAF here would lose the position to fast typing.
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null) return;
    pendingCaret.current = null;
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(caret, caret);
  }, [value]);

  const trimmed = value.trim();
  const canSubmit = trimmed !== '' && !disabled;
  const user = session?.user;
  // Self is filtered out of the directory the list offers.
  const members = useMemo(
    () =>
      (membersData?.members ?? []).filter(
        (member) => member.userId !== user?.id,
      ),
    [membersData?.members, user?.id],
  );
  // Every display name in the workspace — the collision set `handleFor` checks.
  // The viewer is included: their own name collides with an offered member's.
  const directoryNames = useMemo(
    () => (membersData?.members ?? []).map((member) => member.name),
    [membersData?.members],
  );

  // Matches on word prefix — the same shape the server resolves ('@ana' finds
  // Ana Ruiz, '@an' does not find Yonatane), so the list never offers someone
  // the written handle couldn't reach. First-word hits sort above the rest.
  const suggestions = useMemo(() => {
    if (!mention) return [];
    const query = mention.query.toLowerCase();
    const scored = members
      .map((member) => {
        const name = member.name.toLowerCase();
        const words = name.split(/\s+/);
        const slug = mentionSlug(member.name);
        const score =
          query === ''
            ? 0
            : (words[0] ?? '').startsWith(query)
              ? 0
              : words.some((word) => word.startsWith(query)) ||
                  slug.startsWith(query)
                ? 1
                : -1;
        return { member, score };
      })
      .filter(({ score }) => score >= 0);

    return scored
      .sort((a, b) => a.score - b.score)
      .slice(0, MAX_SUGGESTIONS)
      .map(({ member }) => member);
  }, [members, mention]);

  const open = mention !== null && suggestions.length > 0;
  const active = open
    ? suggestions[Math.min(activeIndex, suggestions.length - 1)]
    : undefined;

  /** Re-derives the mention from the caret — called after any text edit. */
  const syncMention = (nextValue: string, caret: number) => {
    const next = disabled ? null : readMention(nextValue, caret);
    setMention(next);
    setActiveIndex(0);
  };

  const insertMention = (name: string) => {
    const field = fieldRef.current;
    if (!field || !mention) return;
    const caret = field.selectionStart;
    // First word of the name, or the dashed slug when that word is shared
    // (mentionHandleFor) — either way a token the server resolves (D6).
    const token = `@${mentionHandleFor(name, directoryNames)} `;
    const next = `${value.slice(0, mention.start)}${token}${value.slice(caret)}`;
    // Caret goes after the inserted handle, not to the end of the text.
    pendingCaret.current = mention.start + token.length;
    setValue(next);
    setMention(null);
  };

  const resize = (field: HTMLTextAreaElement) => {
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, MAX_FIELD_HEIGHT)}px`;
  };

  const submit = async () => {
    if (!canSubmit || posting) return;
    setPosting(true);
    try {
      await onSubmit?.(trimmed);
      // Cleared only on success: the page surfaces the error and the draft
      // stays put for a retry.
      setValue('');
      setMention(null);
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

      <div className="relative flex min-w-0 flex-1 flex-col rounded-md border border-ds-border bg-ds-surface-subtle px-3 py-2.5">
        {/* Suggestions open upward — the composer is the page's last element. */}
        {open ? (
          <div
            id={listId}
            role="listbox"
            aria-label="Mention a member"
            className="absolute bottom-full left-0 right-0 z-20 mb-2 flex flex-col gap-0.5 rounded-xl border border-ds-border bg-ds-surface p-1 shadow-[0_8px_24px_#00000029]"
          >
            {suggestions.map((member, index) => (
              <button
                key={member.userId}
                id={`${listId}-${member.userId}`}
                type="button"
                role="option"
                aria-selected={
                  index === (active ? suggestions.indexOf(active) : 0)
                }
                // mousedown, not click: the field must keep focus so the caret
                // is still where the token is when we splice the handle in.
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertMention(member.name);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none',
                  index === (active ? suggestions.indexOf(active) : 0)
                    ? 'bg-ds-surface-subtle'
                    : 'hover:bg-ds-surface-subtle',
                )}
              >
                {member.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={member.image}
                    alt=""
                    className="size-5 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-full font-mono text-[7px] font-bold text-white',
                      toneFor(member.userId),
                    )}
                    aria-hidden
                  >
                    {initialsOf(member.name)}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                  {member.name}
                </span>
                {/* Email disambiguates members who share a handle. */}
                <span className="hidden shrink-0 truncate text-[10px] text-ds-text-muted sm:block">
                  {member.email}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-2.5">
          <textarea
            ref={fieldRef}
            value={value}
            disabled={disabled}
            rows={1}
            aria-label="Leave a comment"
            // Combobox-on-textarea is the ARIA 1.2 pattern for a multi-line
            // field that opens a suggestion listbox.
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={
              open && active ? `${listId}-${active.userId}` : undefined
            }
            onChange={(event) => {
              setValue(event.target.value);
              resize(event.currentTarget);
              syncMention(
                event.target.value,
                event.currentTarget.selectionStart ?? 0,
              );
            }}
            onClick={(event) => {
              // Caret moved — the token under it may have changed.
              syncMention(value, event.currentTarget.selectionStart ?? 0);
            }}
            onBlur={() => setMention(null)}
            onKeyDown={(event) => {
              if (open) {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  const delta = event.key === 'ArrowDown' ? 1 : -1;
                  setActiveIndex(
                    (prev) =>
                      (prev + delta + suggestions.length) % suggestions.length,
                  );
                  return;
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  if (active) {
                    event.preventDefault();
                    insertMention(active.name);
                    return;
                  }
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setMention(null);
                  return;
                }
              }
              // Escape with no list up leaves the text alone.
              if (event.key === 'Escape' && mention) setMention(null);
            }}
            placeholder={
              disabled ? 'Archived issues are read-only' : 'Leave a comment…'
            }
            className={cn(
              'w-full resize-none overflow-y-auto bg-transparent text-[12.5px] leading-[1.6] text-foreground',
              'placeholder:text-ds-text-muted focus:outline-none disabled:cursor-not-allowed',
            )}
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
              className="h-[26px] rounded-md bg-ds-brand px-3 text-xs font-semibold text-white hover:bg-ds-brand/90 disabled:opacity-50"
            >
              Comment
            </StatefulButton>
          </div>
        </div>
      </div>
    </div>
  );
}
