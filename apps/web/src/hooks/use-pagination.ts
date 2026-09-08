import { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Client-side pagination — the members + invitations APIs return the full
// list (already filtered by the parent), and the directory tables slice it
// into pages locally. Page state lives in the table; reset-to-first-page on
// filter change is handled by the parent via `key`.
// ─────────────────────────────────────────────────────────────────────────────

export function useClientPagination<T>(items: T[], pageSize: number) {
  const effectivePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 1;
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / effectivePageSize));
  const [page, setPage] = useState(1);
  // Clamp at render — e.g. the list shrinks while sitting on a later page.
  // Callers derive navigation from `currentPage`, so it always continues from
  // what's displayed.
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex =
    totalCount === 0 ? 0 : (currentPage - 1) * effectivePageSize;
  const pagedItems = items.slice(startIndex, startIndex + effectivePageSize);
  const endIndex = startIndex + pagedItems.length;

  return {
    pagedItems,
    currentPage,
    totalPages,
    totalCount,
    startIndex,
    endIndex,
    setPage,
  };
}
