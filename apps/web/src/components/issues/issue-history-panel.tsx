'use client';

import { format } from 'date-fns';
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  CornerDownRight,
  History as HistoryIcon,
  OctagonAlert,
  RotateCw,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type {
  IssueHistoryCard,
  IssuePriority,
  IssueStatus,
  LabelCard,
} from '@shipyard/shared';
import { Loader } from '@/components/motion/loader';
import { StatefulButton } from '@/components/motion/button/stateful';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { IssueLabelPill } from '@/components/issues/issue-label-pill';
import { IssuePriorityBadge } from '@/components/issues/issue-priority-badge';
import { IssueStatusBadge } from '@/components/issues/issue-status-badge';
import { useInfiniteIssueHistory, useLabels } from '@/hooks/use-issues';
import { useMembers } from '@/hooks/use-members';
import { useProjects } from '@/hooks/use-projects';
import { useCycles } from '@/hooks/use-cycles';
import { cn } from '@/lib/utils';

/** Superseded values read a step back — the same badge, dimmed, so the row
 *  still shows *what* it moved away from in the product's own styling. */
const PAST_VALUE = 'opacity-60';

/** Old-value text pills (title) stay neutral (design: Old … Pill = #F0EFEB). */
const NEUTRAL_PILL = 'bg-[#F0EFEB] text-ds-text-muted';

const AVATAR_TONES = [
  'bg-ds-brand',
  'bg-ds-info',
  'bg-ds-warning',
  'bg-ds-success',
] as const;

function toneFor(userId: string): (typeof AVATAR_TONES)[number] {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1)
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

function ValuePill({ text, tone }: { text: string; tone?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center rounded-full px-[7px] text-[10px] font-medium leading-none',
        tone ?? NEUTRAL_PILL,
      )}
    >
      <span className="max-w-[220px] truncate">{text}</span>
    </span>
  );
}

/** Status value — the product's status badge (glyph + status colour), dimmed
 *  when it's the value being moved away from. */
function StatusValue({
  status,
  past,
}: {
  status: IssueStatus;
  past?: boolean;
}) {
  return (
    <IssueStatusBadge
      status={status}
      className={past ? PAST_VALUE : undefined}
    />
  );
}

/** Priority value — the shared priority badge (card + row pill). */
function PriorityValue({
  priority,
  past,
}: {
  priority: IssuePriority;
  past?: boolean;
}) {
  return (
    <IssuePriorityBadge
      priority={priority}
      className={past ? PAST_VALUE : undefined}
    />
  );
}

/**
 * Assignee value — the avatar + name chip the kanban card uses (initials fall
 * back to a per-user tone). Null reads "Unassigned" in the card's muted style.
 */
function AssigneeValue({
  member,
  past,
}: {
  member: { userId: string; name: string; image: string | null } | null;
  past?: boolean;
}) {
  if (!member)
    return (
      <span className="text-[11px] font-medium leading-none text-ds-text-muted">
        Unassigned
      </span>
    );
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5',
        past && PAST_VALUE,
      )}
    >
      {member.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.image}
          alt=""
          className="size-5 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-full font-mono text-[7px] font-bold text-white',
            toneFor(member.userId),
          )}
          aria-hidden
        >
          {initialsOf(member.name)}
        </span>
      )}
      <span className="truncate text-[11px] font-medium leading-none text-foreground">
        {member.name}
      </span>
    </span>
  );
}

/** Project / cycle value — the kanban card's project • cycle line, split into
 *  the two halves a history row changes separately. */
function ProjectCycleValue({ name, past }: { name: string; past?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1 text-[11px] font-medium leading-none text-ds-text-muted',
        past && PAST_VALUE,
      )}
    >
      <CornerDownRight aria-hidden className="size-3 shrink-0" />
      <span className="max-w-[220px] truncate">{name}</span>
    </span>
  );
}

/** Due date value — the card's calendar chip, minus the pill chrome when it
 *  sits inside a history row. */
function DueValue({ value, past }: { value: string | null; past?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-medium leading-none text-ds-text-muted',
        past && PAST_VALUE,
      )}
    >
      <Calendar aria-hidden className="size-3 shrink-0" />
      {value
        ? format(new Date(`${value}T12:00:00`), 'MMM d, yyyy')
        : 'No due date'}
    </span>
  );
}

/** Blocked value — the row's Blocked badge (danger soft + octagon) with the
 *  reason beside it, the same pairing the card shows through its title attr. */
function BlockedValue({
  reason,
  past,
}: {
  reason: string | null;
  past?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5',
        past && PAST_VALUE,
      )}
    >
      <span className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full bg-ds-danger-soft px-[7px] text-[10px] font-semibold leading-none text-ds-danger">
        <OctagonAlert aria-hidden className="size-2.5" />
        Blocked
      </span>
      {reason ? (
        <span className="max-w-[220px] truncate text-[11px] leading-none text-ds-text-muted">
          {reason}
        </span>
      ) : null}
    </span>
  );
}

/** Old → new pair on the meta row (design: "… value › value  EVENT_TYPE"). */
function ChangePills({ from, to }: { from: ReactNode; to: ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {from}
      <ArrowRight aria-hidden className="size-3 shrink-0 text-ds-text-muted" />
      {to}
    </span>
  );
}

type EntryCopy = {
  /** Verb phrase after the actor's name — e.g. "moved status". */
  action: string;
  /** Identity value rendered inline after the action (assignee, label, reason). */
  inline?: ReactNode;
  /** Old → new pair rendered on the meta row. */
  change?: { from: ReactNode; to: ReactNode };
};

/**
 * Turns one typed `issue_history` row into the row's copy + pills. Values are
 * stored as raw ids/enums/ISO strings (data-model D7), so ids resolve through
 * the workspace lookups; an unresolvable id falls back to neutral wording
 * rather than leaking a cuid into the timeline.
 */
function describeEntry(
  entry: IssueHistoryCard,
  lookups: {
    member: (
      id: string | null,
    ) => { userId: string; name: string; image: string | null } | null;
    projectName: (id: string | null) => string | null;
    cycleName: (id: string | null) => string | null;
    label: (id: string | null) => LabelCard | null;
  },
): EntryCopy {
  const { member, projectName, cycleName, label } = lookups;
  const oldValue = entry.oldValue;
  const newValue = entry.newValue;

  // Every value renders with the component the rest of the app already uses for
  // it (status badge, priority badge, assignee chip, project • cycle line,
  // label pill, Blocked badge) so the timeline reads as the product's own
  // vocabulary. The superseded half is the same element, dimmed.
  const status = (value: string | null, past = false) =>
    value ? (
      <StatusValue status={value as IssueStatus} past={past} />
    ) : (
      <ValuePill text="—" />
    );
  const priority = (value: string | null, past = false) =>
    value ? (
      <PriorityValue priority={value as IssuePriority} past={past} />
    ) : (
      <ValuePill text="—" />
    );

  switch (entry.event) {
    case 'CREATED':
      return { action: 'created this issue' };
    case 'STATUS_CHANGED':
      return {
        action: 'moved status',
        change: { from: status(oldValue, true), to: status(newValue) },
      };
    case 'PRIORITY_CHANGED':
      return {
        action: 'changed priority',
        change: { from: priority(oldValue, true), to: priority(newValue) },
      };
    case 'ASSIGNED':
      return {
        action: 'assigned',
        inline: <AssigneeValue member={member(newValue)} />,
      };
    case 'UNASSIGNED':
      return {
        action: 'unassigned',
        inline: member(oldValue) ? (
          <AssigneeValue member={member(oldValue)} past />
        ) : undefined,
      };
    case 'LABEL_ADDED':
    case 'LABEL_REMOVED': {
      const tag = label(newValue);
      return {
        action: entry.event === 'LABEL_ADDED' ? 'added label' : 'removed label',
        inline: tag ? (
          <IssueLabelPill
            label={tag}
            className={entry.event === 'LABEL_REMOVED' ? PAST_VALUE : undefined}
          />
        ) : undefined,
      };
    }
    case 'PROJECT_CHANGED':
      return {
        action: 'changed project',
        change: {
          from: (
            <ProjectCycleValue
              name={projectName(oldValue) ?? 'No project'}
              past
            />
          ),
          to: (
            <ProjectCycleValue name={projectName(newValue) ?? 'No project'} />
          ),
        },
      };
    case 'CYCLE_CHANGED':
      return {
        action: 'changed cycle',
        change: {
          from: (
            <ProjectCycleValue name={cycleName(oldValue) ?? 'No cycle'} past />
          ),
          to: <ProjectCycleValue name={cycleName(newValue) ?? 'No cycle'} />,
        },
      };
    case 'DUE_DATE_CHANGED':
      return {
        action: 'changed due date',
        change: {
          from: <DueValue value={oldValue} past />,
          to: <DueValue value={newValue} />,
        },
      };
    case 'TITLE_CHANGED':
      // Titles/descriptions are prose, not a badge anywhere in the product, so
      // they stay as plain truncated text pills.
      return {
        action: 'renamed',
        change: {
          from: <ValuePill text={oldValue ?? '—'} />,
          to: (
            <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-ds-brand-soft px-[7px] text-[10px] font-medium leading-none text-ds-brand">
              <span className="max-w-[220px] truncate">{newValue ?? '—'}</span>
            </span>
          ),
        },
      };
    case 'BLOCKED_SET':
      return {
        action: oldValue ? 'updated the block reason' : 'marked as blocked',
        inline: newValue ? <BlockedValue reason={newValue} /> : undefined,
      };
    case 'BLOCKED_CLEARED':
      return {
        action: 'unblocked',
        inline: oldValue ? <BlockedValue reason={oldValue} past /> : undefined,
      };
    case 'ARCHIVED':
      return { action: 'archived this issue' };
    case 'RESTORED':
      return { action: 'restored this issue' };
    default: {
      // Exhaustive today, but a future event kind must still render legibly
      // instead of blowing up the timeline — hence the string cast.
      const unknown = entry.event as string;
      return { action: unknown.toLowerCase().replace(/_/g, ' ') };
    }
  }
}

function HistoryEntry({
  entry,
  lookups,
}: {
  entry: IssueHistoryCard;
  lookups: Parameters<typeof describeEntry>[1];
}) {
  const actor = entry.actor;
  const name = actor?.name ?? 'Someone';
  const copy = describeEntry(entry, lookups);

  return (
    // p-2 gives the hover band breathing room on every side; the content
    // column's pb is trimmed to pb-1 so the design's 20px row rhythm survives
    // (4 + 8 + 8 = the old pb-5).
    <div className="flex w-full gap-2.5 rounded-lg p-2 transition-colors hover:bg-ds-bg/60">
      {/* Actor avatar — image when we have one, initials otherwise; a system
          actor (no actorId) gets a neutral glyph. */}
      {actor ? (
        actor.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={actor.image}
            alt=""
            className="size-[26px] shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            className={cn(
              'grid size-[26px] shrink-0 place-items-center rounded-full font-mono text-[9px] font-bold text-white',
              toneFor(actor.userId),
            )}
            aria-label={name}
            title={name}
          >
            {initialsOf(name)}
          </span>
        )
      ) : (
        <span
          className="grid size-[26px] shrink-0 place-items-center rounded-full bg-[#F0EFEB] text-ds-text-muted"
          aria-label="System"
          title="System"
        >
          <UserRound aria-hidden className="size-3.5" />
        </span>
      )}

      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col pb-1',
          copy.change ? 'gap-1.5' : 'gap-1',
        )}
      >
        <div className="flex w-full items-center justify-between gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] leading-none">
            <span className="shrink-0 font-semibold text-foreground">
              {name}
            </span>
            <span className="text-foreground">{copy.action}</span>
            {copy.inline}
          </div>
          <span className="shrink-0 text-[11px] leading-none text-ds-text-muted">
            {format(new Date(entry.createdAt), 'MMM d, HH:mm')}
          </span>
        </div>
        <div className="flex w-full items-center gap-2">
          {copy.change ? (
            <ChangePills from={copy.change.from} to={copy.change.to} />
          ) : null}
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.7px] text-ds-text-muted">
            {entry.event}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Issue History Panel — mirrors "History Panel" in
 * Screen / Issues - Detail / History (shipyard.pen): the typed `issue_history`
 * timeline, oldest first (F5 #8), each row an actor avatar + "<Name> <action>"
 * + optional old → new pills + the raw EVENT_TYPE in mono, closed by a
 * "Showing N events • oldest first" footer.
 *
 * Values arrive as raw ids/enums (data-model D7), so the panel resolves them
 * against the workspace lookups it already shares with the rest of the page
 * (React Query dedupes those fetches). Description edits are intentionally
 * absent — they emit no history row.
 */
export function IssueHistoryPanel({
  slug,
  issueId,
}: {
  slug: string;
  issueId: string;
}) {
  const historyQuery = useInfiniteIssueHistory(slug, issueId);
  const { data: membersData } = useMembers(slug);
  const { data: projectsData } = useProjects(slug);
  const { data: cyclesData } = useCycles(slug);
  const { data: labelsData } = useLabels(slug);

  const lookups = {
    member: (id: string | null) =>
      id ? (membersData?.members.find((m) => m.userId === id) ?? null) : null,
    projectName: (id: string | null) =>
      id
        ? (projectsData?.projects.find((p) => p.id === id)?.name ?? null)
        : null,
    cycleName: (id: string | null) =>
      id ? (cyclesData?.cycles.find((c) => c.id === id)?.name ?? null) : null,
    label: (id: string | null) =>
      id ? (labelsData?.labels.find((l) => l.id === id) ?? null) : null,
  };

  if (historyQuery.isPending) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <Loader size={28} variant="spinner" label="Loading issue history" />
      </div>
    );
  }

  if (historyQuery.isError) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <ErrorState
          title="Couldn't load history"
          description="We ran into a problem fetching this issue's history."
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => historyQuery.refetch()}
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

  const history = historyQuery.data.pages.flatMap((page) => page.history);

  if (history.length === 0) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <EmptyState
          icon={HistoryIcon}
          title="No history yet"
          description="Status, assignment and property changes show up here as the issue moves."
        />
      </div>
    );
  }

  // Oldest-first is the API's order (spec §3.3); pages append at the bottom,
  // so "show more" reads as "older". While a page is outstanding the footer
  // must not claim the timeline is complete.
  const plural = history.length === 1 ? 'event' : 'events';
  const hasMore = historyQuery.hasNextPage;
  const footer = hasMore
    ? `Showing the first ${history.length} ${plural} • oldest first`
    : `Showing ${history.length} ${plural} • oldest first`;

  return (
    // The panel is the page's only scroll container: the header, description
    // and the properties rail stay put while the timeline moves under them.
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="min-h-0 w-full flex-1 overflow-y-auto pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {history.map((entry) => (
          <HistoryEntry key={entry.id} entry={entry} lookups={lookups} />
        ))}

        {/* Manual pagination — the timeline loads 10 at a time on click. */}
        {hasMore ? (
          <div className="flex w-full items-center justify-center py-3">
            <StatefulButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => historyQuery.fetchNextPage()}
              state={historyQuery.isFetchingNextPage ? 'loading' : 'idle'}
              loadingText="Loading…"
              icon={<ChevronDown aria-hidden className="size-3.5" />}
              className="gap-1.5 rounded-md border border-ds-border bg-ds-surface text-[11.5px] font-semibold text-foreground hover:bg-ds-bg hover:text-foreground"
            >
              Show more events
            </StatefulButton>
          </div>
        ) : null}
      </div>

      {/* Pinned progress line — stays visible however long the timeline gets. */}
      <div className="flex w-full shrink-0 items-center gap-1.5 border-t border-ds-border pt-3 pb-1 pl-2">
        <span className="text-[11px] text-ds-text-muted">{footer}</span>
      </div>
    </div>
  );
}
