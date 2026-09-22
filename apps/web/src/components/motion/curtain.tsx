'use client';

import { motion, useReducedMotion } from 'motion/react';
import { EASE_OUT } from '@/lib/ease';
import { cn } from '@/lib/utils';

/**
 * A cover laid over the content it sits in, which lifts to reveal it.
 *
 * The element is absolute over its nearest positioned ancestor, so the parent
 * must be `relative` and `overflow-hidden`. It paints above whatever comes
 * before it in the parent, which is the content it is covering.
 *
 * The reveal is a `scaleY` from 1 to 0 with the transform origin at the top, so
 * the cover's bottom edge sweeps upward and the content is uncovered from its
 * bottom edge to its top. That is a transform rather than an animated `height`
 * on purpose: `height` is a layout property, and every frame of it would
 * re-measure the box and everything around it, while `scaleY` is composited.
 *
 * The colour is the caller's: it has to match what the content sits on, or the
 * cover reads as a slab instead of as the page. Under
 * `prefers-reduced-motion` nothing renders at all, so the content is simply
 * there.
 */
export function Curtain({
  className,
  /** Seconds before it lifts. Default 0. */
  delay = 0,
  /** Seconds the lift takes. Default 0.6. */
  duration = 0.6,
  /** Start when it scrolls into view instead of on mount. Default true. */
  inView = true,
}: {
  className?: string;
  delay?: number;
  duration?: number;
  inView?: boolean;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return null;
  }

  const lifted = { scaleY: 0 };

  return (
    <motion.div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 origin-top',
        className,
      )}
      initial={{ scaleY: 1 }}
      animate={inView ? undefined : lifted}
      whileInView={inView ? lifted : undefined}
      viewport={inView ? { once: true, amount: 0.2 } : undefined}
      transition={{ duration, ease: EASE_OUT, delay }}
    />
  );
}
