'use client';

import { notFound } from 'next/navigation';

import { Loader } from '@/components/motion/loader';
import { useWorkspace, useWorkspaces } from '@/hooks/use-workspaces';
import { WorkspaceMemory } from '@/components/workspace/workspace-memory';
import { canViewArchived } from '@/lib/workspace/role';

export function WorkspaceGate({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const detail = useWorkspace(slug);
  const list = useWorkspaces();
  const isPending = detail.isPending || list.isPending;
  const data = detail.data;

  if (isPending) {
    return (
      <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader variant="spinner" size={32} label="Loading workspace" />
        <p className="text-sm text-muted-foreground">Loading workspace…</p>
      </div>
    );
  }

  if (detail.isError) {
    const status =
      typeof detail.error === 'object' &&
      detail.error !== null &&
      'status' in detail.error
        ? (detail.error as { status: number }).status
        : undefined;
    if (status === 404) notFound();
    const message =
      detail.error instanceof Error
        ? detail.error.message
        : 'Failed to load workspace';
    return (
      <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    );
  }

  if (list.isError) {
    const message =
      list.error instanceof Error
        ? list.error.message
        : 'Failed to load workspaces';
    return (
      <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    );
  }

  if (!data) notFound();

  if (data.status === 'ARCHIVED' && !canViewArchived(data.role)) notFound();

  return (
    <>
      <WorkspaceMemory slug={slug} />
      {children}
    </>
  );
}
