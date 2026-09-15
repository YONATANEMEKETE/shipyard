'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { Loader } from '@/components/motion/loader';
import { getSelectedWorkspace } from '@/lib/workspace/selected-workspace';

/**
 * Bare `/settings` — account settings are workspace-shell scoped
 * (`/w/[slug]/settings/account`), so this URL has no slug to render.
 *
 * Redirects to the last-selected workspace's account settings, falling back
 * to `/w` when nothing is stored — that dispatcher already handles the zero
 * active / single / multi / unauthenticated cases.
 */
export default function SettingsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const slug = getSelectedWorkspace();
    router.replace(slug ? `/w/${slug}/settings/account` : '/w');
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background">
      <Loader variant="spinner" size={32} label="Opening your settings" />
      <p className="text-sm text-muted-foreground">Opening your settings…</p>
    </div>
  );
}
