'use client';

import { format } from 'date-fns';

import { useSession } from '@/hooks/use-session';
import { useWorkspace } from '@/hooks/use-workspaces';

/**
 * Dashboard header — mirrors "Dashboard Header Row" (I1nBK) in
 * `Screen / Dashboard` (s4L8ST): eyebrow, greeting, and a dated subcopy.
 *
 * The design pairs it with a Quick Actions cluster (Create issue / Export);
 * that is deliberately not built here.
 *
 * Client-only by construction: WorkspaceGate paints a loader during SSR, so
 * these children never server-render. The greeting and the date are therefore
 * computed against the browser clock with no hydration mismatch. Were the gate
 * ever changed to render children on the server, both would need to move to a
 * mount effect or carry `suppressHydrationWarning`.
 */

/** Morning / afternoon / evening, split at the conventional 12 and 18. */
function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** First word of the display name — "Maya Chen" greets as "Maya". */
function firstNameOf(name: string | undefined): string | undefined {
  return name?.trim().split(/\s+/)[0] || undefined;
}

export function DashboardHeader({ slug }: { slug: string }) {
  const { data: session } = useSession();
  const { data: workspace } = useWorkspace(slug);

  const now = new Date();
  const greeting = greetingFor(now.getHours());
  // The name is dropped rather than left dangling ("Good morning, ") while the
  // session resolves — the header reads as a complete sentence either way.
  const firstName = firstNameOf(session?.user.name);
  const heading = firstName ? `${greeting}, ${firstName}` : greeting;

  const workspaceName = workspace?.name ?? 'your workspace';
  const subcopy = `${format(now, 'EEEE, MMMM d')} · Here's where ${workspaceName} stands today.`;

  return (
    // Same shape as ProjectsPage / IssuesPage / CyclesPage: the eyebrow is a
    // sibling of the header row, separated by the page's 24px gap — not a
    // child of the heading stack, where it would sit 6px off the title.
    <div className="flex w-full flex-col gap-6">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-ds-brand">
        Dashboard
      </span>

      {/* Header row — `justify-between` is kept so the deferred Quick Actions
          cluster drops in without a layout change. */}
      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="text-[28px] font-bold leading-none tracking-[-1px] text-foreground">
            {heading}
          </h1>
          <p className="text-[13px] leading-[1.5] text-muted-foreground">
            {subcopy}
          </p>
        </div>
      </div>
    </div>
  );
}
