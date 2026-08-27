'use client';

import * as React from 'react';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';
import {
  Button as MotionButton,
  type ButtonProps as MotionButtonProps,
  type ButtonVariant as MotionVariant,
  type ButtonSize as MotionSize,
} from '@/components/motion/button/base';

// ---------------------------------------------------------------------------
// Compatibility maps — old shadcn API → beUI motion API (Harbor Amber: h-9, rounded-md)
// ---------------------------------------------------------------------------
type LegacyVariant =
  'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type LegacySize =
  'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';

const variantMap: Record<LegacyVariant | MotionVariant, MotionVariant> = {
  default: 'primary',
  primary: 'primary',
  destructive: 'primary', // destructive maps to primary with destructive colors via className override below — keep visual distinction
  outline: 'outline',
  secondary: 'secondary',
  ghost: 'ghost',
  link: 'ghost',
};

const sizeMap: Record<LegacySize | MotionSize, MotionSize> = {
  default: 'md',
  md: 'md',
  xs: 'sm',
  sm: 'sm',
  lg: 'lg',
  icon: 'icon',
  'icon-xs': 'icon',
  'icon-sm': 'icon',
  'icon-lg': 'icon',
};

// Extra styles for legacy destructive (bg-destructive) — motion's primary is bg-primary, so override when needed
const legacyDestructiveClass =
  'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40';
const legacyLinkClass =
  'text-primary underline-offset-4 hover:underline bg-transparent';

export interface ButtonProps extends Omit<
  MotionButtonProps,
  'variant' | 'size'
> {
  variant?: LegacyVariant | MotionVariant;
  size?: LegacySize | MotionSize;
  asChild?: boolean;
}

// Keep buttonVariants export for backwards compat (tests removed but may be imported)
import { cva } from 'class-variance-authority';
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        primary: 'bg-primary text-primary-foreground',
        destructive: legacyDestructiveClass,
        outline: 'border bg-background',
        secondary: 'bg-secondary text-secondary-foreground',
        ghost: 'hover:bg-accent',
        link: legacyLinkClass,
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3',
        md: 'h-9 px-4',
        lg: 'h-11 px-6',
        icon: 'size-9',
        xs: 'h-8 px-3',
        'icon-xs': 'size-6',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
  },
);

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = 'default', size = 'default', asChild, ...props },
    ref,
  ) {
    const motionVariant =
      (variantMap as Record<string, MotionVariant>)[variant as string] ??
      'primary';
    const motionSize =
      (sizeMap as Record<string, MotionSize>)[size as string] ?? 'md';

    // Preserve legacy destructive/link visuals via extra class
    const legacyClass =
      variant === 'destructive'
        ? legacyDestructiveClass
        : variant === 'link'
          ? legacyLinkClass
          : undefined;

    if (asChild) {
      const Comp = Slot.Root as unknown as React.ElementType;
      return (
        <Comp
          ref={ref}
          data-slot="button"
          data-variant={variant}
          data-size={size}
          className={cn(legacyClass, className)}
          {...props}
        />
      );
    }

    return (
      <MotionButton
        ref={ref}
        variant={motionVariant}
        size={motionSize}
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={cn(legacyClass, className)}
        {...(props as MotionButtonProps)}
      />
    );
  },
);
Button.displayName = 'Button';
