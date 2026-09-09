'use client';

import type { LabelCard } from '@shipyard/shared';
import { cn } from '@/lib/utils';

export function IssueLabelPill({
  label,
  className,
}: {
  label: LabelCard;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center rounded-full border border-transparent px-[7px] text-[10px] font-medium leading-none',
        className,
      )}
      style={{ backgroundColor: `${label.color}18`, color: label.color }}
      title={label.name}
    >
      {label.name}
    </span>
  );
}

export function IssueLabelPills({
  labels,
  className,
}: {
  labels: LabelCard[];
  className?: string;
}) {
  if (labels.length === 0) return null;
  return (
    <>
      {labels.map((label) => (
        <IssueLabelPill
          key={label.id}
          label={label}
          className={cn('hidden sm:inline-flex', className)}
        />
      ))}
    </>
  );
}
