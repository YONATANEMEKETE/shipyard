import { cn } from '@/lib/utils';

/**
 * The marketing surface's content column.
 *
 * Every section renders its inner content through this component — the header
 * bar's contents, every landing section, the product band, the footer — so a
 * single max width and a single set of page gutters run down the whole page. A
 * section may be full-bleed (bar backgrounds, the hero's rules); the content
 * inside it stays on this axis. The hero's own three-column split is the one
 * deliberate exception: it is percentage-based, not container-based (see
 * `hero.tsx`).
 *
 * 1440px: wide enough for the product band's screenshot to read at its own
 * scale, still narrow enough that the hero's centred copy keeps a comfortable
 * measure.
 *
 * Gutters step with the viewport (16 → 24 → 32px).
 */
export function Container({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8',
        className,
      )}
      {...props}
    />
  );
}
