'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { Loader } from '@/components/motion/loader';
import { useWorkspaces } from '@/hooks/use-workspaces';
import {
  clearSelectedWorkspace,
  getSelectedWorkspace,
  setSelectedWorkspace,
} from '@/lib/workspace/selected-workspace';

export default function WorkspaceDispatcherPage() {
  const router = useRouter();
  const { data, isPending, isError, error } = useWorkspaces();

  useEffect(() => {
    if (isPending || isError || !data) return;

    const active = data.workspaces.filter((w) => w.status === 'ACTIVE');

    if (active.length === 0) {
      router.replace('/onboarding');
      return;
    }

    if (active.length === 1) {
      const slug = active[0]!.slug;
      setSelectedWorkspace(slug);
      router.replace(`/w/${slug}`);
      return;
    }

    const stored = getSelectedWorkspace();

    if (stored && active.some((w) => w.slug === stored)) {
      router.replace(`/w/${stored}`);
      return;
    }

    if (stored) {
      clearSelectedWorkspace();
    }

    router.replace('/select-workspace');
  }, [data, isPending, isError, router]);

  useEffect(() => {
    if (!isError) return;
    const isUnauthorized =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      (error as { status: number }).status === 401;
    if (isUnauthorized) router.replace('/sign-in');
  }, [isError, error, router]);

  if (isError) {
    const message =
      error instanceof Error ? error.message : 'Failed to load workspaces';

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
        <button
          type="button"
          onClick={() => router.replace('/sign-in')}
          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background">
      <Loader variant="spinner" size={32} label="Loading your workspace" />
      <p className="text-sm text-muted-foreground">Loading your workspace…</p>
    </div>
  );
}
