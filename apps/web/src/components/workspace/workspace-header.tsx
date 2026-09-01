'use client';

import { usePathname } from 'next/navigation';
import {
  Bell,
  Building2,
  Calendar,
  CircleCheck,
  Folder,
  LogOut,
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
import { LeaveWorkspaceDialog } from '@/components/members/leave-workspace-dialog';
import { useWorkspace } from '@/hooks/use-workspaces';
import { isArchived } from '@/lib/workspace/is-archived';
import { useMemo } from 'react';

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
  const [leaveOpen, setLeaveOpen] = useState(false);
  const label = usePageContext(slug);
  const { data: workspace } = useWorkspace(slug);
  const archived = isArchived(workspace);
  const role = workspace?.role ?? null;

  const createItems = useMemo(() => {
    const all = [
      { label: 'Workspace', icon: Building2 },
      { label: 'Issue', icon: CircleCheck },
      { label: 'Project', icon: Folder },
      { label: 'Cycle', icon: Calendar },
    ] as const;
    if (role === 'MEMBER') {
      return all.filter(
        (item) => item.label === 'Workspace' || item.label === 'Issue',
      );
    }
    return [...all];
  }, [role]);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 bg-transparent px-3 sm:h-16 sm:gap-3 sm:px-3 sm:pr-6">
      {/* Collapse sidebar */}
      <button
        type="button"
        aria-label="Toggle sidebar"
        onClick={onToggleSidebar}
        className="-ml-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:-ml-1.5"
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="h-3.5 w-3.5" />
        ) : (
          <PanelLeftClose className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Page context — hidden on very small screens to save space */}
      <Breadcrumb
        aria-label="Workspace breadcrumb"
        className="hidden shrink-0 sm:block"
      >
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
            <BreadcrumbPage className="max-w-[20ch] truncate text-[12px] uppercase text-foreground sm:max-w-none sm:text-[13px]">
              {label}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex-1" />

      {/* Global search — hidden on mobile, visible from sm+ */}
      <div className="hidden sm:block">
        <Input
          type="text"
          placeholder="Search workspace…"
          aria-label="Search workspace"
          className="w-[200px] lg:w-[280px]"
          leftIcon={<Search />}
          rightIcon={
            <span className="inline-flex h-[22px] items-center justify-center rounded border border-ds-border bg-ds-sidebar px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ⌘ K
            </span>
          }
          classNames={{
            field:
              'h-9 rounded-lg border-ds-border bg-ds-surface hover:border-ds-border-strong',
            input: 'pl-9 pr-12 text-xs',
            leftIcon: 'left-2.5 [&_svg]:h-[15px] [&_svg]:w-[15px]',
            rightIcon: 'pr-1.5',
          }}
        />
      </div>

      {/* Notifications */}
      <div className="relative shrink-0">
        <button
          type="button"
          aria-label="Notifications"
          className="grid size-8 place-items-center rounded-lg border border-ds-border bg-ds-surface text-foreground transition-colors hover:border-ds-border-strong sm:size-9"
        >
          <Bell className="h-4 w-4 sm:h-[17px] sm:w-[17px]" />
        </button>
        <Float
          placement="top-end"
          aria-hidden
          className="size-2 rounded-full bg-ds-accent ring-2 ring-ds-bg !translate-x-1/4 !-translate-y-1/4"
        />
      </div>

      {/* Leave workspace — always available, Owner sees transfer variant */}
      <button
        type="button"
        aria-label="Leave workspace"
        onClick={() => setLeaveOpen(true)}
        className="grid size-8 shrink-0 place-items-center rounded-lg border border-ds-border bg-ds-surface text-muted-foreground transition-colors hover:border-ds-border-strong hover:text-foreground sm:size-9"
      >
        <LogOut className="h-4 w-4 sm:h-[17px] sm:w-[17px]" />
      </button>

      {/* Create — disabled while archived; filtered by role */}
      <div className="shrink-0">
        <BloomMenu
          placement="bottom-end"
          disabled={archived}
          items={createItems as never}
          onSelect={(label) => {
            if (label === 'Workspace') setCreateOpen(true);
          }}
        />
      </div>
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <LeaveWorkspaceDialog
        slug={slug}
        workspaceName={workspace?.name ?? 'this workspace'}
        workspaceRole={workspace?.role}
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
      />
    </header>
  );
}
