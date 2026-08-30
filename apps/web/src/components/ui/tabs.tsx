'use client';

import { Tabs as ArkTabs, useTabsContext } from '@ark-ui/react/tabs';
import type React from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { cn } from '@/lib/utils';

export const useTabs = useTabsContext;

export const Tabs = (props: React.ComponentProps<typeof ArkTabs.Root>) => {
  const { lazyMount = true, unmountOnExit = true, className, ...rest } = props;

  return (
    <ArkTabs.Root
      className={cn(
        'flex flex-col gap-2',
        'data-[orientation=vertical]:flex-row',
        className,
      )}
      data-slot="tabs"
      lazyMount={lazyMount}
      unmountOnExit={unmountOnExit}
      {...rest}
    />
  );
};

const tabsListVariants = tv({
  slots: {
    base: [
      'relative z-0',
      'w-fit',
      'text-muted-foreground',
      'flex items-center justify-center gap-x-0.5',
      'data-[orientation=vertical]:flex-col',
    ],
    indicator: [
      'absolute left-(--left) top-(--top)',
      'h-(--height) w-(--width)',
      'transition-[width,translate] duration-200 ease-in-out',
      'motion-reduce:transition-none!',
    ],
  },
  variants: {
    variant: {
      default: {
        base: ['rounded-lg p-1'],
        indicator: [
          '-z-1 rounded-md bg-ds-surface border border-ds-border shadow-sm',
        ],
      },
      underline: {
        base: [
          'data-[orientation=vertical]:px-1',
          'data-[orientation=horizontal]:py-1',
          '*:data-[slot=tabs-tab]:hover:bg-accent',
        ],
        indicator: [
          'z-10',
          'absolute bottom-0',
          'bg-primary',
          'data-[orientation=horizontal]:h-0.5',
          'data-[orientation=vertical]:w-0.5',
        ],
      },
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});
interface TabsListProps
  extends
    React.ComponentProps<typeof ArkTabs.List>,
    VariantProps<typeof tabsListVariants> {}

export const TabsList = (props: TabsListProps) => {
  const { variant = 'default', className, children, ...rest } = props;

  const { base, indicator } = tabsListVariants({ variant });

  return (
    <ArkTabs.List
      className={cn(base(), className)}
      data-slot="tabs-list"
      {...rest}
    >
      {children}

      <ArkTabs.Indicator
        className={cn(indicator())}
        data-slot="tab-indicator"
      />
    </ArkTabs.List>
  );
};

export const TabsTrigger = (
  props: React.ComponentProps<typeof ArkTabs.Trigger>,
) => {
  const { className, ...rest } = props;

  return (
    <ArkTabs.Trigger
      className={cn(
        'relative z-10',
        'h-7',
        'flex shrink-0 items-center justify-center gap-1.5',
        'px-3',
        'whitespace-nowrap text-xs font-medium',
        'rounded-md border border-transparent',
        'cursor-pointer',
        'transition-[color,background-color,box-shadow]',
        'data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start',
        'text-muted-foreground hover:text-foreground',
        'aria-selected:text-foreground aria-selected:font-semibold',
        'outline-none focus-visible:border-ring focus-visible:ring-[2px] focus-visible:ring-ring/30',
        'data-disabled:pointer-events-none data-disabled:opacity-60',
        "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:shrink-0",
        'motion-reduce:transition-none!',
        className,
      )}
      data-slot="tabs-trigger"
      {...rest}
    />
  );
};

export const TabsContent = (
  props: React.ComponentProps<typeof ArkTabs.Content>,
) => {
  const { className, ...rest } = props;

  return (
    <ArkTabs.Content
      className={cn('flex-1 outline-none', className)}
      data-slot="tabs-content"
      {...rest}
    />
  );
};
