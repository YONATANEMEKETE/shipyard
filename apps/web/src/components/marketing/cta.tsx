import { ArrowUpRight } from 'lucide-react';

import { Container } from '@/components/marketing/container';
import { REPOSITORY_URL, X_URL } from '@/components/marketing/site-header';
import { Button } from '@/components/ui/button';

/**
 * The closing call to action — the last thing on the page.
 *
 * The wordmark carries the section: SHIPYARD in the product's own wordmark face
 * (Geist, the font the header lockup and the logo system use), drawn at 4% of the
 * page's ink so it reads as a watermark the copy sits on rather than as a second
 * headline. Its baseline hangs below the section's bottom edge, so the letters
 * are cropped there and the page ends on the word instead of on a rule.
 *
 * The sizing is exact rather than approximate: an SVG with a fixed viewBox and
 * `textLength` + `lengthAdjust="spacing"` on the text node widens the letter
 * spacing until the word fills the width, leaving the glyph shapes untouched. So
 * it meets both edges at every viewport with no measuring and no JavaScript, and
 * no layout shift when the font loads. A clamped font size cannot do that,
 * because it cannot know how wide the word rendered.
 *
 * The two actions are the page's own: the primary is the hero's, and the
 * secondary is the repository, which is where the open-source story lives now
 * that it has no section of its own. Under them, the author's signature sits as
 * the page's last line, and it links to the same X profile the header's nav does.
 * There is no footer under this: this is the end of the page, and the header
 * already carries the repository and the feed.
 */

export function Cta() {
  return (
    <section className="relative overflow-hidden border-t border-ds-border">
      {/* The watermark: pinned to the section's bottom edge, running the full
          width of the viewport rather than the content axis, so the word is as
          large as the page can carry. The viewBox is narrower than the word's
          natural advance, which scales the glyphs up until they nearly touch; the
          crop at the bottom is the viewBox's own height. Decorative, so it stays
          out of the tree.

          Below `lg` the word is allowed to **bleed past both edges** (the section
          is `overflow-hidden`, so the bleed is clipped): spanning the exact width
          is what ties the letter height to the viewport, and a word that only just
          fits a phone renders at ~61px of letter where the desktop shows ~235px.
          Widening the box buys back the size at the price of slicing the outer
          `S` and `D` — an acceptable trade on a watermark at 4% of the page's ink,
          and the percentage is the one knob to tune. At `lg` it meets both edges
          exactly again, which is the composition the section was drawn for. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-[-8%] bottom-0 select-none sm:inset-x-[-5%] md:inset-x-[-3%] lg:inset-x-0"
      >
        <svg
          viewBox="0 0 880 200"
          className="block h-auto w-full fill-ds-text/[0.04]"
        >
          <text
            x="0"
            y="230"
            textLength="880"
            lengthAdjust="spacing"
            fontSize="200"
            fontWeight="650"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            SHIPYARD
          </text>
        </svg>
      </span>

      <Container className="relative flex flex-col items-center py-28 text-center sm:py-36">
        <h2 className="relative max-w-[560px] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Start with the workspace you already have
        </h2>

        <div className="relative mt-8 flex flex-col items-center gap-5 sm:flex-row sm:gap-7">
          <Button size="lg" asChild>
            <a href="/sign-up">Start a workspace</a>
          </Button>

          <a
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-ds-text-muted transition-colors hover:text-ds-text"
          >
            Read the code
            <ArrowUpRight aria-hidden className="size-3.5" />
          </a>
        </div>

        <p className="relative mt-12 text-xs text-ds-text-muted">
          Made with ❤️ by{' '}
          <a
            href={X_URL}
            target="_blank"
            rel="noreferrer"
            className="text-ds-text transition-colors hover:text-ds-brand"
          >
            Yonatane Mekete
          </a>
        </p>
      </Container>
    </section>
  );
}
