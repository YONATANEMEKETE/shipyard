'use client';

import { motion, useReducedMotion } from 'motion/react';

import type { WorkspaceIconKey } from '@shipyard/shared';
import { getWorkspaceIcon } from '@/lib/workspace/icons';
import { cn } from '@/lib/utils';

type IconWrapperSize = 'xs' | 'sm' | 'md' | 'lg';
type IconWrapperVariant = 'soft' | 'solid' | 'outline';

const SIZE_MAP: Record<IconWrapperSize, { tile: string; icon: number }> = {
  xs: { tile: 'size-6 rounded-md', icon: 12 },
  sm: { tile: 'size-[24px] rounded-[6px]', icon: 14 },
  md: { tile: 'size-9 rounded-md', icon: 16 },
  lg: { tile: 'size-11 rounded-md', icon: 20 },
};

const VARIANT_MAP: Record<IconWrapperVariant, string> = {
  soft: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  solid: 'bg-amber-600 text-white border border-amber-600',
  outline: 'bg-card text-muted-foreground border border-border',
};

export interface IconWrapperProps {
  icon: WorkspaceIconKey | string | null | undefined;
  size?: IconWrapperSize;
  variant?: IconWrapperVariant;
  className?: string;
}

export function IconWrapper({
  icon,
  size = 'sm',
  variant = 'soft',
  className,
}: IconWrapperProps) {
  const reduce = useReducedMotion();
  const Component = getWorkspaceIcon(icon);
  const dims = SIZE_MAP[size];

  if (!Component) {
    return (
      <span
        aria-hidden
        className={cn(
          'inline-grid place-items-center shrink-0',
          dims.tile,
          VARIANT_MAP[variant],
          className,
        )}
      />
    );
  }

  return (
    <motion.span
      aria-hidden
      // subtle scale pop on icon change — uses beui's smooth spring
      key={String(icon)}
      initial={reduce ? false : { scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={
        reduce
          ? { duration: 0.1 }
          : { type: 'spring', duration: 0.4, bounce: 0.3 }
      }
      className={cn(
        'inline-grid place-items-center shrink-0',
        dims.tile,
        VARIANT_MAP[variant],
        className,
      )}
    >
      {/* lucide icon resolved from static map — not created during render */}
      {/* eslint-disable-next-line react-hooks/static-components */}
      <Component size={dims.icon} className="shrink-0" />
    </motion.span>
  );
}
