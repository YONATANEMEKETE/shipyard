'use client';

import { usePathname } from 'next/navigation';
import {
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
} from 'lucide-react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

const CONTEXT: Record<string, string> = {
  '': 'Dashboard',
  '/issues': 'Issues',
  '/projects': 'Projects',
  '/cycles': 'Cycles',
  '/members': 'Members',
  '/notifications': 'Notifications',
  '/settings': 'Workspace Settings',
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

export function WorkspaceHeader({
  slug,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  slug: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const label = usePageContext(slug);

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 bg-transparent pr-6 pl-3">
      {/* Collapse sidebar */}
      <button
        type="button"
        aria-label="Toggle sidebar"
        onClick={onToggleSidebar}
        className="-ml-1.5 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="h-3.5 w-3.5" />
        ) : (
          <PanelLeftClose className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Page context */}
      <Breadcrumb aria-label="Workspace breadcrumb">
        <BreadcrumbList>
          {label !== 'Dashboard' ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink
                  href={`/w/${slug}`}
                  className="text-[13px] text-muted-foreground"
                >
                  /
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-[13px] uppercase text-foreground">
                  {label}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage className="text-[13px] uppercase text-foreground">
                Dashboard
              </BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      </Breadcrumb>

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
