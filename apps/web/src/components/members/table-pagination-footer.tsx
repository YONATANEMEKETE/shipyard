import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Shared directory-table pagination footer — prev / numbered pages / next
 * plus a caller-built range label. Used by the members directory and the
 * pending invitations table so both paginate identically.
 */

/** Page-button model. Small page counts render every number; large ones collapse to a sliding window with ellipses. */
type PageItem = number | 'ellipsis-start' | 'ellipsis-end';

function pageItems(totalPages: number, page: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const window = new Set<number>([
    1,
    2,
    page - 1,
    page,
    page + 1,
    totalPages - 1,
    totalPages,
  ]);
  const pages = [...window]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const items: PageItem[] = [];
  let previous = 0;
  for (const p of pages) {
    if (previous !== 0 && p - previous > 1) {
      items.push(previous < page ? 'ellipsis-start' : 'ellipsis-end');
    }
    items.push(p);
    previous = p;
  }
  return items;
}

export function TablePaginationFooter({
  page,
  totalPages,
  onPageChange,
  label,
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Range copy, e.g. "Showing 1–15 of 42 members". */
  label: ReactNode;
  /** Row min-width matching the table's scroll width (640px directory, 720px invitations). */
  className?: string;
}) {
  return (
    <div
      className={`flex h-[52px] shrink-0 items-center justify-between gap-4 px-4 md:min-w-0 ${className ?? ''}`}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="grid size-7 place-items-center rounded-md border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-muted-foreground"
        >
          <ChevronLeft className="size-[14px]" />
        </button>
        {pageItems(totalPages, page).map((item) =>
          item === 'ellipsis-start' || item === 'ellipsis-end' ? (
            <span
              key={item}
              aria-hidden
              className="grid size-7 place-items-center text-[11px] text-muted-foreground"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-label={`Go to page ${item}`}
              aria-current={item === page ? 'page' : undefined}
              onClick={() => onPageChange(item)}
              className={
                item === page
                  ? 'grid size-7 place-items-center rounded-md bg-ds-brand text-xs font-semibold text-white'
                  : 'grid size-7 place-items-center rounded-md border border-ds-border bg-ds-bg text-xs font-medium text-muted-foreground transition-colors hover:text-foreground'
              }
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="grid size-7 place-items-center rounded-md border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-muted-foreground"
        >
          <ChevronRight className="size-[14px]" />
        </button>
      </div>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
