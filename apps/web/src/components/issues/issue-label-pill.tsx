'use client';

import type { LabelCard } from '@shipyard/shared';
import { cn } from '@/lib/utils';

function styleFor(name: string): { bg: string; text: string } {
  const n = name.toLowerCase();
  if (n === 'bug') return { bg: 'bg-ds-danger-soft', text: 'text-ds-danger' };
  if (n === 'frontend') return { bg: 'bg-ds-info-soft', text: 'text-ds-info' };
  if (n === 'backend') return { bg: 'bg-ds-brand-soft', text: 'text-ds-brand' };
  return { bg: 'bg-secondary', text: 'text-ds-text-muted' };
}

export function IssueLabelPill({
  label,
  className,
}: {
  label: LabelCard;
  className?: string;
}) {
  const s = styleFor(label.name);
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center rounded-full border border-transparent px-[7px] text-[10px] font-medium leading-none',
        s.bg,
        s.text,
        className,
      )}
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
