'use client';

import { useEffect } from 'react';

import { setSelectedWorkspace } from '@/lib/workspace/selected-workspace';

export function WorkspaceMemory({ slug }: { slug: string }) {
  useEffect(() => {
    setSelectedWorkspace(slug);
  }, [slug]);

  return null;
}
