'use client';

import { History, RotateCw, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { DashboardActivityItem } from '@shipyard/shared';

import {
  ACTIVITY_BUCKET_LABEL,
  activityTimeOf,
  groupByActivityBucket,
  type ActivityBucket,
} from '@/components/activity/activity-grouping';
import {
  RailSectionHeader,
  ViewAllLink,
} from '@/components/dashboard/rail-section-header';
import { Loader } from '@/components/motion/loader';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useDashboard } from '@/hooks/use-dashboard';
import { cn } from '@/lib/utils';

/**
 * Recent Activity — the rail's third section, mirroring "Recent Activity
 * Timeline" (GFwjZ) in `Screen / Dashboard` (s4L8ST): a heading row, then a
 * day-labelled timeline of compact event rows.
 *
 * Rows render the server's `text` verbatim — the hub feed's summary is composed
 * at read time and already leads with the actor's name, so nothing here
 * re-resolves the issue or rebuilds the sentence.
 *
 * The spine is the frame's device: a 1px rule at the avatars' horizontal centre
 * running from the first row's centre to the last's. That is exactly
 * `top-4 bottom-4` on a 32px-row stack, and it collapses to nothing for a
 * single-row group rather than poking out above and below.
 *
 * Grouping is shared with the Activity page (`activity-grouping.ts`), so both
 * surfaces bucket and stamp the same row identically.
 */

/**
 * The endpoint already bounds the feed at 20, but the rail is a preview —
 * eight rows keeps the panel in proportion with the columns beside it.
 * "View all" is the way to the full log.
 */
const MAX_ROWS = 8;

function ActorAvatar({ item }: { item: DashboardActivityItem }) {
  const actor = item.actor;

  if (actor?.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={actor.image}
        alt=""
        className="size-5 shrink-0 rounded-full object-cover"
      />
    );
  }

  if (actor) {
    return (
      <span
        className="grid size-5 shrink-0 place-items-center rounded-full bg-ds-brand-soft font-mono text-[7px] font-bold leading-none text-ds-brand"
        title={actor.name}
        aria-hidden
      >
        {initialsOf(actor.name)}
      </span>
    );
  }

  // Former member — the card resolves `actor` to null rather than a name it can
  // no longer look up.
  return (
    <span
      className="grid size-5 shrink-0 place-items-center rounded-full bg-ds-border/60 text-ds-text-muted"
      title="Former member"
      aria-hidden
    >
      <UserRound className="size-3" />
    </span>
  );
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

function ActivityRow({
  item,
  bucket,
  onOpen,
}: {
  item: DashboardActivityItem;
  bucket: ActivityBucket;
  /** Absent on a surface with nowhere to link to (the landing page). */
  onOpen?: () => void;
}) {
  const className =
    'relative flex h-8 w-full items-center gap-2 rounded-md px-2 text-left transition-colors';

  const body = (
    <>
      <ActorAvatar item={item} />
      <span className="min-w-0 flex-1 truncate text-[12px] leading-none text-foreground">
        {item.text}
      </span>
      <span className="shrink-0 font-mono text-[10px] leading-none text-ds-text-muted">
        {activityTimeOf(item.createdAt, bucket)}
      </span>
    </>
  );

  if (!onOpen) {
    return <div className={className}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(className, 'hover:bg-ds-bg/60')}
    >
      {body}
    </button>
  );
}

/**
 * The feed itself: a bucket label per day-group, the spine between the rows'
 * avatars, and one row per event.
 *
 * Its own export because the landing page shows this same feed with sample
 * events. There it passes no `onOpen`, so the rows are rows rather than deep
 * links into a workspace it does not have.
 */
export function ActivityFeedView({
  events,
  onOpen,
}: {
  events: DashboardActivityItem[];
  onOpen?: (item: DashboardActivityItem) => void;
}) {
  const groups = groupByActivityBucket(events);

  return (
    <div className="flex w-full flex-col gap-1.5">
      {groups.map((group) => (
        <div key={group.bucket} className="flex w-full flex-col gap-1.5">
          <div className="flex h-4 w-full items-center pl-[18px]">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.7px] text-ds-text-muted">
              {ACTIVITY_BUCKET_LABEL[group.bucket]}
            </span>
          </div>

          {/* `relative` + the spine first: the rows are positioned too, so
              they paint over it and leave only the segments between
              avatars visible. */}
          <div className="relative flex w-full flex-col">
            <span
              aria-hidden
              className={cn(
                'absolute left-[18px] top-4 bottom-4 w-px bg-ds-border',
                // A single row has no gap to bridge, and top+bottom on a
                // 32px stack would otherwise leave a zero-height rule that
                // still paints a stray speck.
                group.rows.length === 1 && 'hidden',
              )}
            />
            {group.rows.map((item) => (
              <ActivityRow
                key={`${item.kind}-${item.issue.id}-${item.createdAt}`}
                item={item}
                bucket={group.bucket}
                onOpen={onOpen ? () => onOpen(item) : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RecentActivityPanel({ slug }: { slug: string }) {
  const router = useRouter();
  const query = useDashboard(slug);

  const events = (query.data?.recentActivity ?? []).slice(0, MAX_ROWS);

  // Comment events deep-link to the comment itself; the issue page re-runs the
  // scroll once the thread is in the DOM (issue-conversation.tsx).
  const openEvent = (item: DashboardActivityItem) => {
    const issue = `/w/${slug}/issues/${item.issue.id}`;
    router.push(item.commentId ? `${issue}#comment-${item.commentId}` : issue);
  };

  return (
    <section
      aria-label="Recent activity"
      className="flex w-full flex-col gap-4"
    >
      <RailSectionHeader
        label="Recent Activity"
        action={<ViewAllLink href={`/w/${slug}/activity`} label="View all" />}
      />

      {query.isPending ? (
        <div className="flex min-h-[152px] w-full items-center justify-center">
          <Loader size={28} variant="spinner" label="Loading recent activity" />
        </div>
      ) : query.isError ? (
        <div className="flex min-h-[152px] w-full items-center justify-center">
          <ErrorState
            title="Couldn't load activity"
            description="We ran into a problem fetching recent workspace activity."
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => query.refetch()}
                className="h-8 gap-2 rounded-md border-ds-border bg-ds-surface px-3 text-xs font-semibold text-foreground"
              >
                <RotateCw className="size-3.5" />
                Try again
              </Button>
            }
          />
        </div>
      ) : events.length === 0 ? (
        // No recent activity is data, not an error (spec rule 5).
        <EmptyState
          icon={History}
          title="No recent activity yet"
          description="Updates will appear here as your team collaborates."
        />
      ) : (
        <ActivityFeedView events={events} onOpen={openEvent} />
      )}
    </section>
  );
}
