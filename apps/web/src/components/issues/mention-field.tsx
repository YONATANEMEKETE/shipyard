'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { mentionHandleFor, mentionSlug } from '@shipyard/shared';
import { useMembers } from '@/hooks/use-members';
import { useSession } from '@/hooks/use-session';
import { cn } from '@/lib/utils';

/**
 * Mention-aware text field — the `@` suggestion list and caret handling shared
 * by the comment composer and the inline comment editor. Extracted so the two
 * cannot drift: an edit takes the same directory, the same grammar, and the
 * same disambiguated handle as a post (see `mentionHandleFor`).
 *
 * Typing '@' opens a member list over the field, filtered as you type (the
 * directory is `GET …/members`, filtered client-side — there is no suggestion
 * endpoint, by contract). ↑/↓ move, Enter/Tab or click inserts `@handle ` and
 * closes, Escape dismisses. The server re-parses the text on write, so the
 * mention itself is never sent from here — the field only assembles the token.
 *
 * The viewer is never offered: a self-mention resolves server-side to a join
 * row with no notification (api-design §6.3), so it is a no-op there is no
 * reason to suggest.
 */

/** Grows with the text, then scrolls — the field never eats the thread. */
const MAX_FIELD_HEIGHT = 200;

/**
 * Focus treatment for the frame both comment fields sit in — the composer and
 * the inline editor share it so "the box is live" looks the same in both. The
 * field itself keeps `outline-none`; the brand border and the soft halo are the
 * only focus affordance, which is why they land on the container instead.
 */
export const mentionFieldFrameFocusClass =
  'transition-colors focus-within:border-ds-brand/50 focus-within:ring-[3px] focus-within:ring-ds-brand/15';

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

export interface MentionFieldProps {
  slug: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** The field is a combobox — the label is how tests and AT find it. */
  ariaLabel: string;
  autoFocus?: boolean;
  /**
   * Fired by Shift+Enter — the field's own submit chord. Inside a multi-line
   * textarea plain Enter belongs to the newline, so the composer and the inline
   * editor both reach for the modifier instead.
   */
  onSubmit?: () => void;
  /**
   * Composer sits at the bottom of the panel, so its list opens upward over the
   * thread; an inline editor mid-thread opens downward instead of covering the
   * comments above it.
   */
  suggestAbove?: boolean;
  className?: string;
}

export function MentionField({
  slug,
  value,
  onChange,
  disabled = false,
  placeholder,
  ariaLabel,
  autoFocus = false,
  onSubmit,
  suggestAbove = true,
  className,
}: MentionFieldProps) {
  const { data: session } = useSession();
  const { data: membersData } = useMembers(slug);
  const [mention, setMention] = useState<{
    start: number;
    query: string;
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  /** Caret to restore once the next value lands in the DOM. */
  const pendingCaret = useRef<number | null>(null);
  const listId = useId();

  const user = session?.user;
  // Self is filtered out of the directory the list offers.
  const members = useMemo(
    () =>
      (membersData?.members ?? []).filter(
        (member) => member.userId !== user?.id,
      ),
    [membersData?.members, user?.id],
  );
  // Every display name in the workspace — the collision set `mentionHandleFor`
  // checks. The viewer is included: their own name collides with an offered
  // member's.
  const directoryNames = useMemo(
    () => (membersData?.members ?? []).map((member) => member.name),
    [membersData?.members],
  );

  // Runs after React has written the new value, so the caret is restored in the
  // same commit — a rAF here would lose the position to fast typing.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const caret = pendingCaret.current;
    if (caret !== null) {
      pendingCaret.current = null;
      field.focus();
      field.setSelectionRange(caret, caret);
    }
    // Autosize here, not only on input: a value swapped in from outside (a
    // cleared draft, a comment entering edit mode) must size the field too.
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, MAX_FIELD_HEIGHT)}px`;
  }, [value]);

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
        const slugName = mentionSlug(member.name);
        const score =
          query === ''
            ? 0
            : (words[0] ?? '').startsWith(query)
              ? 0
              : words.some((word) => word.startsWith(query)) ||
                  slugName.startsWith(query)
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
    onChange(next);
    setMention(null);
  };

  return (
    <div className="relative flex w-full flex-col">
      {/* Suggestions open away from the surrounding content. */}
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Mention a member"
          className={cn(
            'absolute left-0 right-0 z-20 flex flex-col gap-0.5 rounded-xl border border-ds-border bg-ds-surface p-1 shadow-[0_8px_24px_#00000029]',
            suggestAbove ? 'bottom-full mb-3' : 'top-full mt-2',
          )}
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

      <textarea
        ref={fieldRef}
        value={value}
        disabled={disabled}
        rows={1}
        aria-label={ariaLabel}
        // Combobox-on-textarea is the ARIA 1.2 pattern for a multi-line
        // field that opens a suggestion listbox.
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={
          open && active ? `${listId}-${active.userId}` : undefined
        }
        autoFocus={autoFocus}
        onChange={(event) => {
          onChange(event.target.value);
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
          // Shift+Enter submits unconditionally, even with the list open: a
          // shortcut that sometimes does nothing is worse than one that always
          // does the obvious thing. Plain Enter keeps its other jobs below.
          if (event.key === 'Enter' && event.shiftKey) {
            event.preventDefault();
            setMention(null);
            onSubmit?.();
            return;
          }
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
        placeholder={placeholder}
        className={cn(
          'w-full resize-none overflow-y-auto bg-transparent text-[12.5px] leading-[1.6] text-foreground',
          'placeholder:text-ds-text-muted focus:outline-none disabled:cursor-not-allowed',
          className,
        )}
      />
    </div>
  );
}
