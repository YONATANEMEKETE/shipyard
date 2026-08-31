import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Global empty-state UI — a centered icon tile + title + description, with
 * an optional action slot. Used wherever a list/table has nothing to show
 * (members directory, pending invitations, search filters, …).
 */
export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Optional call-to-action rendered below the copy. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-10 text-center',
        className,
      )}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-ds-border bg-ds-bg">
        <Icon aria-hidden className="size-5 text-muted-foreground" />
      </span>
      <p className="text-[13px] font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="max-w-[320px] text-xs leading-[1.5] text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
