'use client';

import { motion, useReducedMotion, type Variants } from 'motion/react';
import { EASE_OUT } from '@/lib/ease';
import type { ReactNode } from 'react';

/** Default item entrance — override per usage for faster/subtler cascades. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10, filter: 'blur(4px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.36, ease: EASE_OUT },
  },
};

export function Stagger({
  children,
  className,
  stagger = 0.06,
  delayChildren = 0.04,
}: {
  children: ReactNode;
  className?: string;
  /** Seconds between each child's entrance. Default 0.06. */
  stagger?: number;
  /** Seconds before the first child starts. Default 0.04. */
  delayChildren?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger, delayChildren } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  variants = staggerItem,
}: {
  children: ReactNode;
  className?: string;
  /** Overrides the shared entrance variants (hidden/visible). */
  variants?: Variants;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div variants={variants} className={className}>
      {children}
    </motion.div>
  );
}
