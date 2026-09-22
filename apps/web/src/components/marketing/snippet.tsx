import { cn } from '@/lib/utils';

/**
 * A code snippet for a marketing section, with its own colouring.
 *
 * Hand-coloured on purpose. The snippets on this page are three static blocks
 * with a handful of tokens each, so a highlighter (and its grammar bundles) would
 * be a dependency carried by every visitor for three strings that never change.
 * The tones below are the whole vocabulary, which also keeps the colours on the
 * design system rather than on an editor theme's palette:
 *
 *  - `comment` — file paths and comments, secondary copy;
 *  - `command` — the invocation itself, the part you type;
 *  - `flag` — every name that marks a choice: shell flags, config keys, `.json`
 *    keys. This is the one amber tone, so the accent in a snippet lands on the
 *    parts a reader might change;
 *  - `value` — the payload: URLs, header values, quoted strings;
 *  - `placeholder` — the bits to replace with your own (`shp_...`);
 *  - `punct` — braces, commas, `=`, the quotes around a value, and the shell's
 *    line continuations.
 *
 * A token carries its own leading whitespace, and each line renders `pre` at its
 * own max-content width (`w-max`) inside a block that scrolls sideways
 * (`overflow-x-auto`), so a long URL stays on one line and the reader pans to it
 * rather than the card clipping its tail. The snippet is the only thing that
 * scrolls: the column and the card around it keep their width.
 */
export type SnippetTone =
  'comment' | 'command' | 'flag' | 'value' | 'placeholder' | 'punct';

export type SnippetToken = readonly [tone: SnippetTone, text: string];
export type SnippetLine = readonly SnippetToken[];

const TONE_CLASS = {
  comment: 'text-ds-text-muted',
  command: 'font-semibold text-foreground',
  flag: 'text-ds-brand',
  value: 'text-foreground',
  placeholder: 'text-ds-text-muted',
  punct: 'text-ds-text-muted',
} as const satisfies Record<SnippetTone, string>;

export function Snippet({ lines }: { lines: readonly SnippetLine[] }) {
  return (
    <div className="flex flex-col overflow-x-auto font-mono text-[11px] leading-5 [scrollbar-width:thin]">
      {lines.map((line) => (
        <span
          key={line.map(([, text]) => text).join('')}
          className="w-max min-w-full whitespace-pre"
        >
          {line.map(([tone, text]) => (
            <span key={text} className={cn(TONE_CLASS[tone])}>
              {text}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}
