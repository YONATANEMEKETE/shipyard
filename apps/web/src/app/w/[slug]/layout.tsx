import type { ReactNode } from 'react';

import { WorkspaceShellRoot } from '@/components/workspace/workspace-shell';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <WorkspaceShellRoot slug={slug}>{children}</WorkspaceShellRoot>;
}
