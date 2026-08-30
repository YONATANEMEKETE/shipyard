'use client';

import { usePathname } from 'next/navigation';
import {
  Bell,
  Building2,
  Calendar,
  CircleCheck,
  Folder,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from 'lucide-react';
import { useState } from 'react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import { BloomMenu } from '@/components/motion/bloom-menu';
import { Float } from '@/components/ui/float';
import { Input } from '@/components/ui/input';
import { CreateWorkspaceDialog } from '@/components/workspace/create-workspace-dialog';
import { useWorkspace } from '@/hooks/use-workspaces';
import { isArchived } from '@/lib/workspace/is-archived';

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
  const [createOpen, setCreateOpen] = useState(false);
  const label = usePageContext(slug);
  const { data: workspace } = useWorkspace(slug);
  const archived = isArchived(workspace);

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

      {/* Page context — single "/" then label, no duplicate separators */}
      <Breadcrumb aria-label="Workspace breadcrumb">
        <BreadcrumbList>
          <BreadcrumbItem>
            <span
              aria-hidden
              className="text-[13px] leading-none text-muted-foreground/60"
            >
              /
            </span>
          </BreadcrumbItem>
          <BreadcrumbItem>
            {label === 'Dashboard' ? (
              <BreadcrumbPage className="text-[13px] uppercase text-foreground">
                Dashboard
              </BreadcrumbPage>
            ) : (
              <BreadcrumbPage className="text-[13px] uppercase text-foreground">
                {label}
              </BreadcrumbPage>
            )}
          </BreadcrumbItem>
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

      {/* Create — disabled while this workspace is archived (read-only) */}
      <BloomMenu
        placement="bottom-end"
        disabled={archived}
        items={[
          { label: 'Workspace', icon: Building2 },
          { label: 'Issue', icon: CircleCheck },
          { label: 'Project', icon: Folder },
          { label: 'Cycle', icon: Calendar },
        ]}
        onSelect={(label) => {
          if (label === 'Workspace') setCreateOpen(true);
        }}
      />
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </header>
  );
}
