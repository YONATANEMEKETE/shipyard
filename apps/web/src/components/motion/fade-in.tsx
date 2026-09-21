'use client';

import { motion, useReducedMotion, type Variants } from 'motion/react';
import { Fragment, type ReactNode } from 'react';
import { EASE_OUT } from '@/lib/ease';
import { cn } from '@/lib/utils';

/**
 * Entrance animations for a text block, all built on motion variants.
 *
 * The point of splitting text into elements is to stagger it, so the entrance is
 * one declarative animation per unit (word or letter) rather than a timer and a
 * growing string: no re-render per step, the full text is in the DOM from the
 * first paint, and the animation is cancel-safe the way the rest of
 * `components/motion` is.
 *
 * Three pieces, meant to be composed with ascending `delay`s so a block settles
 * top-down: `FadeInLetters` for a short strip (a badge), `FadeInWords` for
 * sentences and headlines, `FadeIn` for a single element (the CTA) that closes
 * the cascade.
 *
 * Layout notes, learned the hard way:
 *  - Words are `inline-block` (so the rise and blur apply), and the whitespace
 *    between them is a text node of the *parent*, not of the animated span. A
 *    space packed inside the atomic box would remove the line-break opportunity
 *    and turn a paragraph into one unwrappable line.
 *  - Letters animate `opacity` only and stay plain inline spans. `filter` and
 *    transforms do not reliably apply to non-replaced inline boxes, and making
 *    each letter `inline-block` would be a worse trade: it fixes nothing and
 *    risks the same wrapping problem.
 *
 * Under `prefers-reduced-motion` every one of these renders plain static text.
 */

/** Whole-word entrance: a short rise, a small blur clearing, and the fade. */
const wordVariants: Variants = {
  hidden: { opacity: 0, y: 6, filter: 'blur(3px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.28, ease: EASE_OUT },
  },
};

/** Letter entrance: the fade alone, no movement (see layout notes above). */
const letterVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3, ease: EASE_OUT } },
};

/** Order-of-children timing. */
function cascade(stagger: number, delay: number): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
  };
}

/**
 * A line whose words fade in one after another.
 *
 * `accent` paints one word with `accentClassName`, for a headline that carries
 * a single brand-coloured word. Matching ignores surrounding punctuation, so
 * `accent="organized"` still matches the `organized.` that ends a sentence.
 */
export function FadeInWords({
  text,
  className,
  accent,
  accentClassName,
  /** Seconds between each word's entrance. Default 0.06. */
  stagger = 0.06,
  /** Seconds before the first word starts. Default 0.25. */
  delay = 0.25,
}: {
  text: string;
  className?: string;
  /** A word to paint differently, e.g. the headline's brand word. */
  accent?: string;
  accentClassName?: string;
  stagger?: number;
  delay?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <span className={className}>
        {accent === undefined
          ? text
          : paintAccent(text, accent, accentClassName)}
      </span>
    );
  }

  const words = splitWords(text);

  return (
    <motion.span
      className={className}
      initial="hidden"
      animate="visible"
      variants={cascade(stagger, delay)}
    >
      {words.map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          <motion.span
            className={
              isAccent(word, accent)
                ? cn('inline-block', accentClassName)
                : 'inline-block'
            }
            variants={wordVariants}
          >
            {word}
          </motion.span>
          {index < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </motion.span>
  );
}

/**
 * A line whose letters fade in one after another, left to right.
 *
 * Deliberately not a typing simulation: no caret, no character-by-character
 * reveal of a narrowing substring: every letter is present from the first paint
 * and they simply come up in sequence. Built for a short strip where per-letter
 * is legible, which is where a word stagger reads as too coarse.
 */
export function FadeInLetters({
  text,
  className,
  /** Seconds between each letter. Default 0.02. */
  stagger = 0.02,
  /** Seconds before the first letter starts. Default 0.12. */
  delay = 0.12,
}: {
  text: string;
  className?: string;
  stagger?: number;
  delay?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <span className={className}>{text}</span>;
  }

  const words = text.split(/\s+/);

  return (
    <motion.span
      className={className}
      initial="hidden"
      animate="visible"
      variants={cascade(stagger, delay)}
    >
      {words.map((word, wordIndex) => (
        <Fragment key={`${word}-${wordIndex}`}>
          {Array.from(word).map((letter, letterIndex) => (
            <motion.span
              key={`${letter}-${letterIndex}`}
              variants={letterVariants}
            >
              {letter}
            </motion.span>
          ))}
          {wordIndex < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </motion.span>
  );
}

/**
 * A single element that fades in and lifts, on its own clock.
 *
 * Use it for the one element that should follow a cascade rather than be part
 * of it (a button under a paragraph), or for a large block that should arrive
 * when it is actually looked at (`inView`, which fires once on scroll-in rather
 * than on mount; anything below the fold otherwise animates before it is seen).
 * Big elements want a bigger `y` and a longer `duration` than a word does, and
 * `blur` off: a blur pass over a full-width screenshot costs more than it reads.
 */
export function FadeIn({
  children,
  className,
  /** Seconds before it starts. Default 0.2. */
  delay = 0.2,
  /** Pixels it rises from. Default 10. */
  y = 10,
  /** Seconds the entrance takes. Default 0.3. */
  duration = 0.3,
  /** Start when it scrolls into view instead of on mount. Default false. */
  inView = false,
  /** Blur the element while it is arriving. Default true. */
  blur = true,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  duration?: number;
  inView?: boolean;
  blur?: boolean;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  const entrance = { opacity: 0, y, filter: blur ? 'blur(4px)' : 'none' };
  const settled = { opacity: 1, y: 0, filter: blur ? 'blur(0px)' : 'none' };

  return (
    <motion.div
      className={className}
      initial={entrance}
      animate={inView ? undefined : settled}
      whileInView={inView ? settled : undefined}
      viewport={inView ? { once: true, amount: 0.15 } : undefined}
      transition={{ duration, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Lone separators that travel with the word they follow, not on their own. */
const SEPARATOR = /^[·•|/\\–—-]$/;

/** Leading/trailing punctuation, dropped before comparing a word to `accent`. */
const TRIM = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

function splitWords(text: string): string[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .reduce<string[]>((words, part) => {
      const previous = words.at(-1);
      if (SEPARATOR.test(part) && previous) {
        words[words.length - 1] = `${previous} ${part}`;
      } else {
        words.push(part);
      }
      return words;
    }, []);
}

function isAccent(word: string, accent?: string): boolean {
  if (!accent) return false;
  return word.replace(TRIM, '').toLowerCase() === accent.toLowerCase();
}

/** Wraps the accent word in a span, for the reduced-motion path. */
function paintAccent(
  text: string,
  accent: string,
  accentClassName?: string,
): ReactNode {
  const parts = text.split(' ');
  return parts.map((word, index) => (
    <Fragment key={`${word}-${index}`}>
      {isAccent(word, accent) ? (
        <span className={accentClassName}>{word}</span>
      ) : (
        word
      )}
      {index < parts.length - 1 ? ' ' : null}
    </Fragment>
  ));
}
