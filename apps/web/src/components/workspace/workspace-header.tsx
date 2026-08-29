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
import { Float } from '@/components/ui/float';
import { Input } from '@/components/ui/input';

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
        className="-ml-1.5 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="h-3.5 w-3.5" />
        ) : (
          <PanelLeftClose className="h-3.5 w-3.5" />
        )}
      </button>

      <span
        aria-hidden
        className="text-[13px] leading-none text-muted-foreground/60"
      >
        /
      </span>

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
      <Input
        type="text"
        placeholder="Search workspace…"
        aria-label="Search workspace"
        className="w-[280px]"
        leftIcon={<Search />}
        rightIcon={
          <span className="inline-flex h-[22px] items-center justify-center rounded border border-ds-border bg-ds-sidebar px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ⌘ K
          </span>
        }
        classNames={{
          field:
            'rounded-lg border-ds-border bg-ds-surface hover:border-ds-border-strong',
          input: 'pl-9 pr-12 text-xs',
          leftIcon: 'left-2.5 [&_svg]:h-[15px] [&_svg]:w-[15px]',
          rightIcon: 'pr-1.5',
        }}
      />

      {/* Notifications */}
      <div className="relative">
        <button
          type="button"
          aria-label="Notifications"
          className="grid size-9 place-items-center rounded-lg border border-ds-border bg-ds-surface text-foreground transition-colors hover:border-ds-border-strong"
        >
          <Bell className="h-[17px] w-[17px]" />
        </button>
        <Float
          placement="top-end"
          aria-hidden
          className="size-2 rounded-full bg-ds-accent ring-2 ring-ds-bg !translate-x-1/4 !-translate-y-1/4"
        />
      </div>

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
