'use client';

import type { ReactNode } from 'react';

import { WorkspaceSidebar } from '@/components/workspace/workspace-sidebar';
import { WorkspaceHeader } from '@/components/workspace/workspace-header';
import { WorkspaceContent } from '@/components/workspace/workspace-content';
import {
  SidebarStateProvider,
  useSidebarState,
} from '@/components/workspace/sidebar-state';

/**
 * App shell for everything inside a workspace (/w/:slug).
 *
 * The shell canvas is ds-bg (#F4F3EF); sidebar and header are transparent
 * over it, and the main content renders as a white rounded surface inset
 * 6px. It will resolve the real workspace by slug (GET /api/v1/workspaces/
 * :slug) during integration.
 */
function WorkspaceShell({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  const { collapsed, toggle } = useSidebarState();

  return (
    <div className="flex h-screen overflow-hidden bg-ds-bg">
      <WorkspaceSidebar slug={slug} collapsed={collapsed} onClose={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceHeader
          slug={slug}
          sidebarCollapsed={collapsed}
          onToggleSidebar={toggle}
        />
        <WorkspaceContent>{children}</WorkspaceContent>
      </div>
    </div>
  );
}

export function WorkspaceShellRoot({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  return (
    <SidebarStateProvider>
      <WorkspaceShell slug={slug}>{children}</WorkspaceShell>
    </SidebarStateProvider>
  );
}
