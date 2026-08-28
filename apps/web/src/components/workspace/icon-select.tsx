'use client';

import { motion } from 'motion/react';
import { useMemo } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/motion/select';
import { WORKSPACE_ICON_KEYS, type WorkspaceIconKey } from '@shipyard/shared';
import { IconWrapper } from './icon-wrapper';

function formatIconLabel(key: string): string {
  return key
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export interface IconSelectProps {
  value?: WorkspaceIconKey;
  defaultValue?: WorkspaceIconKey;
  onValueChange?: (value: WorkspaceIconKey) => void;
  disabled?: boolean;
}

export function IconSelect({
  value,
  defaultValue = 'boxes',
  onValueChange,
  disabled,
}: IconSelectProps) {
  const keys = useMemo(() => [...WORKSPACE_ICON_KEYS], []);

  return (
    <Select
      value={value}
      defaultValue={defaultValue}
      onValueChange={(v) => onValueChange?.(v as WorkspaceIconKey)}
      disabled={disabled}
    >
      <SelectTrigger className="h-11 rounded-xl border-border bg-card px-3 hover:border-border focus-visible:ring-0 focus-visible:border-border data-[state=open]:border-border">
        <span className="flex items-center gap-3">
          <IconWrapper icon={value ?? defaultValue} size="sm" variant="soft" />
          <span className="text-sm font-medium text-foreground">
            {formatIconLabel(value ?? defaultValue ?? 'boxes')}
          </span>
        </span>
      </SelectTrigger>

      <SelectContent className="z-30 rounded-xl">
        <div className="flex flex-wrap gap-1.5 p-1.5 list-none">
          {keys.map((key) => {
            const isSelected = (value ?? defaultValue) === key;
            return (
              <SelectItem
                key={key}
                value={key}
                className="p-0 rounded-lg justify-center bg-transparent hover:bg-transparent focus-visible:bg-transparent text-foreground list-none [&::marker]:hidden marker:hidden [&>svg]:hidden"
              >
                <motion.span
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  className="group grid size-[38px] place-items-center rounded-lg outline-none"
                >
                  <IconWrapper
                    icon={key}
                    size="lg"
                    variant={isSelected ? 'solid' : 'outline'}
                    className={
                      isSelected
                        ? 'size-[38px] rounded-lg ring-2 ring-amber-600/25 ring-offset-2 ring-offset-background'
                        : 'size-[38px] rounded-lg bg-card transition-colors group-hover:border-amber-300 group-hover:text-amber-600 dark:group-hover:border-amber-800 dark:group-hover:text-amber-300'
                    }
                  />
                </motion.span>
              </SelectItem>
            );
          })}
        </div>
      </SelectContent>
    </Select>
  );
}

// Re-export for onboarding preview usage
export { IconWrapper, formatIconLabel };
