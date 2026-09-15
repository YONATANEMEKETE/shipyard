'use client';

import type { SearchType } from '@shipyard/shared';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/motion/select';

/**
 * "Search within" — the type selector pinned to the right of the dialog header
 * (Element / Global Search — Results in shipyard.pen, rendered with the app's
 * canonical toolbar pill rather than the pen's one-off h30 variant).
 *
 * Built on the app's canonical `motion/select` with the same trigger classes as
 * the Issues/Projects toolbars, so it matches every other select in the product
 * (priority, blocked state, icon picker, leave-workspace target) instead of a
 * one-off dropdown.
 *
 * The value maps 1:1 onto `searchTypeSchema`; `all` is the UI-only extra and is
 * never sent on the wire (the API omits `type` and runs every leg).
 */

export type SearchScope = SearchType | 'all';

export const SEARCH_SCOPE_LABEL: Record<SearchScope, string> = {
  all: 'All types',
  issues: 'Issues',
  projects: 'Projects',
  cycles: 'Cycles',
  members: 'Members',
  comments: 'Comments',
};

const SEARCH_SCOPES: SearchScope[] = [
  'all',
  'issues',
  'projects',
  'cycles',
  'members',
  'comments',
];

export function SearchTypeSelect({
  value,
  onValueChange,
  open,
  onOpenChange,
}: {
  value: SearchScope;
  onValueChange: (value: SearchScope) => void;
  /** Controlled panel state — the dialog lifts it so its ↑↓/↵ handler can stand
   *  down while the option list is open. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as SearchScope)}
      open={open}
      onOpenChange={onOpenChange}
      // Hug the trigger's content so the panel mirrors the pill's width.
      className="shrink-0"
    >
      <SelectTrigger className="h-[34px] gap-1.5 rounded-md! border-ds-border bg-ds-surface px-3 text-xs text-foreground hover:border-ds-border">
        <SelectValue className="min-w-0 truncate" />
      </SelectTrigger>
      {/* Right-anchored so the panel grows leftward into the dialog instead of
          past its clipped right edge; `w-max min-w-full` matches the toolbar
          selects (panel hugs its widest option, never narrower than the pill). */}
      <SelectContent className="left-auto right-0 w-max min-w-full">
        {SEARCH_SCOPES.map((scope) => (
          <SelectItem key={scope} value={scope}>
            {SEARCH_SCOPE_LABEL[scope]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
