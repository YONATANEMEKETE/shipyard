'use client';

import { CurrentCyclePanel } from '@/components/dashboard/current-cycle-panel';
import { ActiveProjectsPanel } from '@/components/dashboard/active-projects-panel';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { MyWorkPanel } from '@/components/dashboard/my-work-panel';
import { RecentActivityPanel } from '@/components/dashboard/recent-activity-panel';

/**
 * Dashboard — the workspace hub, mirroring `Screen / Dashboard` (s4L8ST).
 *
 * The design is a vertical page column (gap 20): the header row, then the
 * body — My Work on the left, the Current Cycle / Active Projects / Recent
 * Activity rail on the right.
 */
export function DashboardPage({ slug }: { slug: string }) {
  return (
    <div className="flex w-full flex-col gap-5">
      <DashboardHeader slug={slug} />

      {/* Body — a row at lg (My Work 684 + gap 24 + rail 420 = the 1128 slot),
          stacking to a column below it. */}
      <div className="flex w-full flex-col gap-6 lg:flex-row">
        <MyWorkPanel slug={slug} />
        {/* Rail — Current Cycle (its own card), then Active Projects and
            Recent Activity as heading + list sections. The card and the
            sections sit on a 16px rhythm (the design's 221 + 16 = 237). */}
        <div className="flex w-full flex-col gap-4 lg:min-w-0 lg:flex-1">
          <CurrentCyclePanel slug={slug} />
          <ActiveProjectsPanel slug={slug} />
          <RecentActivityPanel slug={slug} />
        </div>
      </div>
    </div>
  );
}
