import type { ReactNode } from 'react';

import { WorkspaceSidebar } from '@/components/workspace/workspace-sidebar';
import { WorkspaceHeader } from '@/components/workspace/workspace-header';
import { WorkspaceContent } from '@/components/workspace/workspace-content';

/**
 * App shell for everything inside a workspace (/w/:slug).
 *
 * The shell canvas is ds-bg (#F4F3EF); sidebar and header are transparent
 * over it, and the main content renders as a white rounded surface inset
 * 6px. It will resolve the real workspace by slug (GET /api/v1/workspaces/
 * :slug) during integration.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="flex h-screen overflow-hidden bg-ds-bg">
      <WorkspaceSidebar slug={slug} />
      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceHeader slug={slug} />
        <WorkspaceContent>{children}</WorkspaceContent>
      </div>
    </div>
  );
}
