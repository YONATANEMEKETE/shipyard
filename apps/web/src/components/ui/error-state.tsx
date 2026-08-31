import { TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Global error-state UI — a danger-tinted icon tile + title + description,
 * with an optional action slot (e.g. a retry button). Used in place of
 * list/table content when a query fails.
 */
export interface ErrorStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  /** Optional recovery action, typically a Retry button. */
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  icon: Icon = TriangleAlert,
  title = 'Something went wrong',
  description,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-10 text-center',
        className,
      )}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-ds-danger/20 bg-ds-danger-soft">
        <Icon aria-hidden className="size-5 text-ds-danger" />
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
