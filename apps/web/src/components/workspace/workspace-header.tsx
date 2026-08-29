'use client';

import { usePathname } from 'next/navigation';
import {
  Bell,
  Calendar,
  CircleCheck,
  Folder,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const CONTEXT: Record<string, { icon: LucideIcon; label: string }> = {
  '': { icon: LayoutDashboard, label: 'Dashboard' },
  '/issues': { icon: CircleCheck, label: 'Issues' },
  '/projects': { icon: Folder, label: 'Projects' },
  '/cycles': { icon: Calendar, label: 'Cycles' },
  '/members': { icon: Users, label: 'Members' },
  '/notifications': { icon: Bell, label: 'Notifications' },
  '/settings': { icon: Settings, label: 'Workspace Settings' },
};

function usePageContext(slug: string) {
  const pathname = usePathname();
  const basePath = `/w/${slug}`;
  const rest = pathname.slice(basePath.length);

  // Match the deepest known section; unknown subroutes fall back to Dashboard.
  const match =
    Object.keys(CONTEXT)
      .filter((key) => key !== '' && rest.startsWith(key))
      .sort((a, b) => b.length - a.length)[0] ?? '';

  return CONTEXT[match] ?? CONTEXT['']!;
}

export function WorkspaceHeader({ slug }: { slug: string }) {
  const { icon: Icon, label } = usePageContext(slug);

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 bg-transparent px-6">
      {/* Page context */}
      <div className="flex items-center gap-2">
        <Icon className="h-[18px] w-[18px] text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{label}</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Global search */}
      <button
        type="button"
        className="flex h-9 w-[280px] items-center gap-2 rounded-lg border border-ds-border bg-ds-surface px-2.5 text-left transition-colors hover:border-ds-border-strong"
      >
        <Search className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-xs text-muted-foreground">
          Search workspace…
        </span>
        <span className="inline-flex h-[22px] items-center justify-center rounded border border-ds-border bg-ds-sidebar px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          ⌘ K
        </span>
      </button>

      {/* Notifications */}
      <button
        type="button"
        aria-label="Notifications"
        className="relative grid size-9 place-items-center rounded-lg border border-ds-border bg-ds-surface text-foreground transition-colors hover:border-ds-border-strong"
      >
        <Bell className="h-[17px] w-[17px]" />
        <span
          aria-hidden
          className="absolute right-[3px] top-[3px] size-2 rounded-full bg-ds-accent ring-2 ring-ds-bg"
        />
      </button>

      {/* Create */}
      <button
        type="button"
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-ds-brand px-3.5 text-xs font-semibold text-white transition-colors hover:bg-ds-brand/90"
      >
        <Plus className="h-[15px] w-[15px]" />
        Create
      </button>
    </header>
  );
}
