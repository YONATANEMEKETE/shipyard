'use client';

import {
  Building2,
  CircleCheck,
  Folder,
  MessageSquare,
  RefreshCw,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * Empty search body — the "Element / Global Search — Empty" variant in
 * shipyard.pen: an intro headline, the scope line ("Search in <workspace>")
 * and a legend of what each group covers, so the user knows what's
 * searchable before typing a character.
 *
 * Shown only while the query is blank. A non-blank query with no matches is a
 * different state (the shared EmptyState component), not this one.
 */

const LEGEND: { icon: LucideIcon; name: string; description: string }[] = [
  { icon: CircleCheck, name: 'Issues', description: 'Titles and descriptions' },
  { icon: Folder, name: 'Projects', description: 'Names and descriptions' },
  { icon: RefreshCw, name: 'Cycles', description: 'Names and goals' },
  { icon: Users, name: 'Members', description: 'Names of workspace members' },
  { icon: MessageSquare, name: 'Comments', description: 'Comment bodies' },
];

export function SearchEmptyBody({ workspaceName }: { workspaceName: string }) {
  return (
    // No horizontal padding here: the dialog body already applies p-4, and the
    // rows add px-3 — the same 28px gutter the grouped result rows use.
    <div className="flex w-full flex-col gap-1">
      <div className="flex flex-col gap-1 px-3 pb-3 pt-2">
        <p className="text-sm font-semibold text-foreground">
          Find anything across the workspace
        </p>
        <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
          Start typing to search issues, projects, cycles, members, and
          comments.
        </p>
      </div>

      <div className="flex items-center gap-2 px-3 pb-2.5">
        <Building2 aria-hidden className="size-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Search in</span>
        <span className="text-xs font-semibold text-foreground">
          {workspaceName}
        </span>
      </div>

      {LEGEND.map(({ icon: Icon, name, description }) => (
        <div key={name} className="flex h-[34px] items-center gap-2.5 px-3">
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-[13px] font-medium text-foreground">
            {name}
          </span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </div>
      ))}
    </div>
  );
}
