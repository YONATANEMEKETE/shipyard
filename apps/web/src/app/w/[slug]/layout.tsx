import type { ReactNode } from 'react';

import { WorkspaceShellRoot } from '@/components/workspace/workspace-shell';
import { WorkspaceGate } from '@/components/workspace/workspace-gate';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <WorkspaceShellRoot slug={slug}>
      <WorkspaceGate slug={slug}>{children}</WorkspaceGate>
    </WorkspaceShellRoot>
  );
}
