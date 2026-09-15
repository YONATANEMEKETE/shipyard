'use client';

import { useState } from 'react';

import { ActivityFeed } from '@/components/activity/activity-feed';
import {
  ActivityToolbar,
  type ActivityAreaTab,
} from '@/components/activity/activity-toolbar';

/**
 * Activity page — the workspace narrative feed.
 *
 * Mirrors `Screen / Activity` (vAvXD) in shipyard.pen: eyebrow + 28px title +
 * one-line description, then the toolbar row (area tabs left, actor filter
 * right), then the grouped feed (TODAY / YESTERDAY / …) with per-row actor,
 * summary, and timestamp.
 *
 * The feed itself is `ActivityFeed`, which owns the cursor walk. The filter
 * state lives here so the toolbar and the query read from one source.
 */
export function ActivityPage({ slug }: { slug: string }) {
  // Filter state is owned here so the toolbar stays presentational and the
  // feed query consumes both facets from one place.
  const [area, setArea] = useState<ActivityAreaTab>('all');
  const [actorId, setActorId] = useState<string | undefined>(undefined);

  return (
    <div className="flex w-full flex-col gap-6">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-ds-brand">
        Activity
      </span>

      {/* Header row — matches the Projects / Issues / Cycles convention:
          eyebrow above, 28px title, one-line description beneath. */}
      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="text-[28px] font-bold leading-none tracking-[-1px] text-foreground">
            Activity
          </h1>
          <p className="text-[13px] leading-[1.5] text-muted-foreground">
            A running record of everything happening across the workspace,
            newest first.
          </p>
        </div>
      </div>

      <ActivityToolbar
        slug={slug}
        area={area}
        onAreaChange={setArea}
        actorId={actorId}
        onActorChange={setActorId}
      />

      {/* The feed sits directly on the shell's content surface (WorkspaceContent
          already paints the design's white inset card) — no wrapper card here. */}
      <ActivityFeed
        slug={slug}
        filters={{ area: area === 'all' ? undefined : area, actorId }}
      />
    </div>
  );
}
