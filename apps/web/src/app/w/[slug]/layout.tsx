import type { ReactNode } from 'react';

import { WorkspaceShellRoot } from '@/components/workspace/workspace-shell';
import { WorkspaceMemory } from '@/components/workspace/workspace-memory';

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
      <WorkspaceMemory slug={slug} />
      {children}
    </WorkspaceShellRoot>
  );
}
