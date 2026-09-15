'use client';

import { format, isSameWeek, isToday, isYesterday } from 'date-fns';
import {
  Calendar,
  ChevronDown,
  CircleCheck,
  Folder,
  MessageSquare,
  RotateCw,
  Ship,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Fragment } from 'react';
import type { ActivityArea, ActivityEventCard } from '@shipyard/shared';

import { StatefulButton } from '@/components/motion/button/stateful';
import { Loader } from '@/components/motion/loader';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import {
  useInfiniteActivity,
  type ActivityFilters,
} from '@/hooks/use-activity';
import { useMembers } from '@/hooks/use-members';
import { cn } from '@/lib/utils';

/**
 * Activity feed — mirrors the timeline in `Screen / Activity` (vAvXD): day
 * groups (a mono label + hairline rule), then 44px rows of actor avatar, area
 * icon, frozen summary, and time.
 *
 * Rows render `summary` verbatim. The server composes it from frozen values at
 * write time (`.pen` doc D5) and it already leads with the actor's name —
 * "Maya moved SHIP-24 · Fix login from Todo to In Progress" — so the row never
 * re-resolves the entity or rebuilds the sentence from parts.
 *
 * Pagination is manual, like the issue-detail history tab: 25 rows per page
 * and a "Load more" button that walks `nextCursor` until it is null. No
 * infinite scroll, no auto-fetch on mount.
 */

/** Group buckets, in render order. */
const BUCKETS = ['today', 'yesterday', 'week', 'earlier'] as const;
type Bucket = (typeof BUCKETS)[number];

const BUCKET_LABEL: Record<Bucket, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'This week',
  earlier: 'Earlier',
};

/** Area → the glyph the design pairs with each event family. */
const AREA_ICON: Record<ActivityArea, LucideIcon> = {
  workspace: Ship,
  members: Users,
  projects: Folder,
  issues: CircleCheck,
  comments: MessageSquare,
  cycles: Calendar,
};

function bucketOf(iso: string): Bucket {
  const date = new Date(iso);
  if (isToday(date)) return 'today';
  if (isYesterday(date)) return 'yesterday';
  // Monday-start weeks, matching the workspace's cycle weeks.
  if (isSameWeek(date, new Date(), { weekStartsOn: 1 })) return 'week';
  return 'earlier';
}

/**
 * Time shown at the row's trailing edge. Only today/yesterday carry their day
 * in the group header, so the looser buckets have to name the day themselves —
 * otherwise "This week" and "Earlier" rows stack up as a run of bare clock
 * times with no way to tell which day each landed on.
 */
function timeOf(iso: string, bucket: Bucket): string {
  const date = new Date(iso);
  if (bucket === 'today' || bucket === 'yesterday')
    return format(date, 'HH:mm');
  if (bucket === 'week') return format(date, 'EEE HH:mm');
  return format(date, 'MMM d');
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
  event,
  bucket,
  avatarUrl,
}: {
  event: ActivityEventCard;
  bucket: Bucket;
  /** The actor's avatar, when the roster still knows this member. */
  avatarUrl?: string | null;
}) {
  const Icon = AREA_ICON[event.area];
  // Invitation-lifecycle events have an invitee who may never become a member,
  // so the server freezes their email as `actorName`. A lone "@" reads better
  // than "b" as the initial of "bob@example.com".
  const isEmail = event.actorName.includes('@');
  const initial = isEmail ? '@' : initialsOf(event.actorName);

  return (
    <div className="flex h-11 w-full items-center gap-2.5 px-2 transition-colors hover:bg-ds-bg/60">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="size-6 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className="grid size-6 shrink-0 place-items-center rounded-full bg-ds-brand-soft font-mono text-[10px] font-bold leading-none text-ds-brand"
          aria-hidden
        >
          {initial}
        </span>
      )}

      <Icon aria-hidden className="size-3.5 shrink-0 text-ds-text-muted" />

      <span className="min-w-0 flex-1 truncate text-[13px] leading-none text-foreground">
        {event.summary}
      </span>

      <span className="shrink-0 font-mono text-[11px] leading-none text-ds-text-muted">
        {timeOf(event.createdAt, bucket)}
      </span>
    </div>
  );
}

/** Day group header — mono label + hairline rule, per the design. */
function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex h-6 w-full items-center gap-3">
      <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.7px] text-ds-text-muted">
        {label}
      </span>
      <span className="h-px min-w-0 flex-1 bg-ds-border" />
    </div>
  );
}

export function ActivityFeed({
  slug,
  filters,
}: {
  slug: string;
  filters: ActivityFilters;
}) {
  const query = useInfiniteActivity(slug, filters);
  // Roster supplies the actor's avatar — the event only freezes `actorId`, so
  // the face itself is resolved live (React Query dedupes this with the
  // toolbar's identical fetch).
  const { data: roster } = useMembers(slug);

  if (query.isPending) {
    return (
      <div className="flex w-full flex-1 items-center justify-center py-20">
        <Loader size={28} variant="spinner" label="Loading activity" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex w-full flex-1 items-center justify-center py-20">
        <ErrorState
          title="Couldn't load activity"
          description="We ran into a problem fetching this workspace's activity."
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => query.refetch()}
              className="h-8 gap-2 rounded-md border-ds-border bg-ds-surface px-3 text-xs font-semibold"
            >
              <RotateCw className="size-3.5" />
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const events = query.data.pages.flatMap((page) => page.events);

  if (events.length === 0) {
    return (
      <div className="flex w-full flex-1 items-center justify-center py-20">
        <EmptyState
          icon={Ship}
          title={filters.area ? 'Nothing here yet' : 'No activity yet'}
          description={
            filters.area
              ? 'No events match this filter yet. Try another area, or clear the member filter.'
              : 'Work happening in this workspace will show up here, newest first. Create a project or an issue to get started.'
          }
        />
      </div>
    );
  }

  // One pass per bucket, in fixed order — the API already returns newest-first,
  // so filtering preserves the ordering inside each group.
  const groups = BUCKETS.map((bucket) => ({
    bucket,
    rows: events.filter((event) => bucketOf(event.createdAt) === bucket),
  })).filter((group) => group.rows.length > 0);

  return (
    <div className="flex w-full flex-col">
      {groups.map((group, groupIndex) => (
        <div
          key={group.bucket}
          className={cn('flex w-full flex-col', groupIndex > 0 && 'pt-4')}
        >
          <DayDivider label={BUCKET_LABEL[group.bucket]} />
          {group.rows.map((event, index) => (
            <Fragment key={event.id}>
              <ActivityRow
                event={event}
                bucket={group.bucket}
                avatarUrl={
                  roster?.members.find(
                    (member) => member.userId === event.actorId,
                  )?.image ?? null
                }
              />
              {index < group.rows.length - 1 ? (
                <span className="h-px w-full shrink-0 bg-ds-border" />
              ) : null}
            </Fragment>
          ))}
        </div>
      ))}

      {/* Manual pagination — the walk stops when `nextCursor` comes back null,
          which `hasNextPage` reflects so the button removes itself at the end
          of the log rather than sitting there as a dead control. */}
      {query.hasNextPage ? (
        <div className="flex w-full items-center justify-center py-4">
          <StatefulButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => query.fetchNextPage()}
            state={query.isFetchingNextPage ? 'loading' : 'idle'}
            loadingText="Loading…"
            icon={<ChevronDown aria-hidden className="size-3.5" />}
            className="gap-1.5 rounded-md border border-ds-border bg-ds-surface text-[11.5px] font-semibold text-foreground hover:bg-ds-bg hover:text-foreground"
          >
            Load more
          </StatefulButton>
        </div>
      ) : null}
    </div>
  );
}
