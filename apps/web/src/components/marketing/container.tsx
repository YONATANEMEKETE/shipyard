import { cn } from '@/lib/utils';

/**
 * The marketing surface's content column.
 *
 * Every section renders its inner content through this component — header, hero,
 * product band, footer — so a single max width and a single set of page gutters
 * run down the whole page. A section may have a full-bleed background; its
 * content never exceeds this column. That is what keeps the header rule, the
 * hero copy, the band's cards and the footer on the same axis.
 *
 * 1280px: wide enough for three product cards to breathe side by side, narrow
 * enough that the hero's centred copy keeps a comfortable measure.
 *
 * Gutters step with the viewport (16 → 24 → 32px). The narrow reading column on
 * `/changelog` is a different thing on purpose: that page constrains the text
 * measure, not the page.
 */
export function Container({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8',
        className,
      )}
      {...props}
    />
  );
}
