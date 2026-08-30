'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { Stagger, StaggerItem } from '@/components/motion/stagger';
import {
  WorkspaceCard,
  type WorkspaceCardInput,
} from '@/components/workspace/workspace-card';
import { CreateWorkspaceDialog } from '@/components/workspace/create-workspace-dialog';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { Button } from '@/components/ui/button';
import { useWorkspaces } from '@/hooks/use-workspaces';
import { setSelectedWorkspace } from '@/lib/workspace/selected-workspace';
import { canViewArchived } from '@/lib/workspace/role';
import { useToast } from '@/components/providers/toast-provider';
import { restoreWorkspace } from '@/lib/api/workspaces';
import { useQueryClient } from '@tanstack/react-query';
import { workspaceKeys } from '@/hooks/use-workspaces';

function CardSkeleton() {
  return (
    <div className="flex h-[68px] w-full items-center gap-3.5 rounded-xl border border-ds-border bg-ds-surface px-4">
      <div className="size-10 shrink-0 animate-pulse rounded-xl bg-ds-border/60" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="h-3.5 w-32 animate-pulse rounded bg-ds-border/60" />
        <span className="h-2.5 w-24 animate-pulse rounded bg-ds-border/40" />
      </span>
    </div>
  );
}

export default function SelectWorkspacePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [restoringSlug, setRestoringSlug] = useState<string | null>(null);
  const { data, isPending, isError, error } = useWorkspaces();

  const workspaces = (data?.workspaces ?? []) as WorkspaceCardInput[];
  const activeWorkspaces = workspaces.filter((w) => w.status === 'ACTIVE');
  const archivedWorkspaces = workspaces.filter((w) => w.status === 'ARCHIVED');
  const visibleArchived = archivedWorkspaces.filter((w) =>
    canViewArchived(w.role),
  );

  const handleSelect = (slug: string) => {
    setSelectedWorkspace(slug);
    router.push(`/w/${slug}`);
  };

  const handleRestore = async (slug: string) => {
    setRestoringSlug(slug);
    try {
      await restoreWorkspace(slug);
      await queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      showToast({ status: 'success', title: 'Workspace restored' });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to restore workspace.';
      showToast({ status: 'error', title: msg });
    } finally {
      setRestoringSlug(null);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8 sm:px-6">
      <Stagger className="flex w-full max-w-[580px] flex-col gap-6 sm:gap-7">
        <StaggerItem className="flex flex-col gap-3">
          <h1 className="text-[28px] font-bold leading-[1.12] tracking-[-1.1px] text-foreground sm:text-[34px]">
            Choose a workspace.
          </h1>
          <p className="text-[13px] leading-[1.55] text-muted-foreground">
            You belong to several workspaces. Pick one to continue — your recent
            context is restored when you return.
          </p>
        </StaggerItem>

        {isPending ? (
          <StaggerItem className="flex flex-col gap-2.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-muted-foreground">
              Your workspaces
            </span>
            <div className="flex flex-col gap-2.5">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          </StaggerItem>
        ) : isError ? (
          <StaggerItem className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              {error instanceof Error
                ? error.message
                : 'Failed to load workspaces.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Try again
            </Button>
          </StaggerItem>
        ) : workspaces.length === 0 ? (
          <StaggerItem className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No workspaces yet. Create one to get started.
            </p>
          </StaggerItem>
        ) : (
          <>
            <StaggerItem className="flex flex-col gap-2.5">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-muted-foreground">
                Your workspaces · {activeWorkspaces.length} active
              </span>
              {activeWorkspaces.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {activeWorkspaces.map((workspace) => (
                    <WorkspaceCard
                      key={workspace.id}
                      workspace={workspace}
                      onSelect={() => handleSelect(workspace.slug)}
                      className="px-3.5 sm:px-4"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No active workspaces.
                </p>
              )}
            </StaggerItem>

            {visibleArchived.length > 0 && (
              <StaggerItem className="flex flex-col gap-2.5">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-muted-foreground">
                  Archived workspaces · read only
                </span>
                <div className="flex flex-col gap-2.5">
                  {visibleArchived.map((workspace) => (
                    <WorkspaceCard
                      key={workspace.id}
                      workspace={workspace}
                      onRestore={() => void handleRestore(workspace.slug)}
                      className="px-3.5 sm:px-4"
                    />
                  ))}
                </div>
              </StaggerItem>
            )}
          </>
        )}

        <StaggerItem className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="h-11 w-full gap-2 bg-ds-brand px-3.5 text-xs font-semibold text-white hover:bg-ds-brand/90 sm:h-9 sm:w-auto"
          >
            <Plus className="h-[15px] w-[15px]" />
            New workspace
          </Button>
          <SignOutButton className="h-11 w-full sm:h-9 sm:w-auto" />
        </StaggerItem>
      </Stagger>

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </main>
  );
}
