'use client';

import { Users } from 'lucide-react';
import type { ActivityArea, WorkspaceMemberCard } from '@shipyard/shared';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/motion/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMembers } from '@/hooks/use-members';
import { cn } from '@/lib/utils';

/**
 * Activity toolbar — mirrors "Area Tabs + Actor Filter Row" (kK5ap) in
 * `Screen / Activity` (vAvXD): area tabs on the left, the actor filter on the
 * right, space-between, 34px tall.
 *
 * The tabs use the same `Tabs` / `TabsList` / `TabsTrigger` pair as the
 * Projects and Issues view switches, so the active pill (white surface +
 * border + indicator) is the app's existing tab treatment rather than a
 * page-local one. The container tone is `ds-surface-subtle` (#FBFAF7 in light)
 * to match the design's segmented background.
 *
 * The actor filter is the shared motion `Select`. Options carry the member's
 * avatar as well as their name — two members can share a display name, so the
 * face is what actually identifies the row. The trigger mirrors that: the
 * generic `users` glyph at rest, replaced by the selected member's avatar once
 * one is picked. Options come from the member roster, same as the Owner filter
 * in `ProjectsToolbar`; the state itself is lifted to the page via
 * `onAreaChange` / `onActorChange`, so the toolbar stays presentational.
 */

/** `all` is the absence of the `area` param — never sent to the API. */
export type ActivityAreaTab = 'all' | ActivityArea;

/** Tab order matches the design (All → Workspace → … → Cycles). */
const AREA_TABS: { value: ActivityAreaTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'workspace', label: 'Workspace' },
  { value: 'members', label: 'Members' },
  { value: 'projects', label: 'Projects' },
  { value: 'issues', label: 'Issues' },
  { value: 'comments', label: 'Comments' },
  { value: 'cycles', label: 'Cycles' },
];

/** Sentinel for "no actor filter" — a select needs a concrete value. */
const ALL_MEMBERS = 'ALL';

export function ActivityToolbar({
  slug,
  area,
  onAreaChange,
  actorId,
  onActorChange,
}: {
  slug: string;
  area: ActivityAreaTab;
  onAreaChange: (area: ActivityAreaTab) => void;
  actorId?: string;
  onActorChange: (actorId: string | undefined) => void;
}) {
  const { data: roster } = useMembers(slug);
  const members = roster?.members ?? [];
  const selectedActor = actorId
    ? members.find((member) => member.userId === actorId)
    : undefined;

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <Tabs
        value={area}
        onValueChange={(details) =>
          onAreaChange(details.value as ActivityAreaTab)
        }
        // `min-w-0` overrides the flex item's default `min-width: auto`. Without
        // it the root refuses to shrink below the strip's min-content width
        // (seven chips that are `shrink-0` + `whitespace-nowrap`, ~509px), so
        // the row overflows and the shell's `overflow-x-hidden` silently eats
        // the trailing chips on narrow viewports.
        className="min-w-0"
      >
        {/* The strip owns the side-scroll once it can no longer fit — the same
            posture as the kanban board, the app's other legitimate horizontal
            scroller. Hidden scrollbar matches the shell's convention. */}
        <div className="min-w-0 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className="w-fit gap-0.5 rounded-lg border border-ds-border bg-ds-surface-subtle p-[3px]">
            {AREA_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="aria-selected:text-foreground"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <Select
        value={actorId ?? ALL_MEMBERS}
        onValueChange={(value) =>
          onActorChange(value === ALL_MEMBERS ? undefined : value)
        }
      >
        <SelectTrigger className="h-[34px] w-auto gap-1.5 rounded-lg! border-ds-border bg-ds-surface px-3 text-xs hover:border-ds-border">
          {selectedActor ? (
            <ActorAvatar member={selectedActor} />
          ) : (
            <Users className="size-[14px] shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn(
              'truncate',
              selectedActor ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {selectedActor?.name ?? 'All members'}
          </span>
        </SelectTrigger>
        <SelectContent className="w-max min-w-full">
          <SelectItem value={ALL_MEMBERS}>All members</SelectItem>
          {members.map((member) => (
            // Filter by the user id — the activity endpoint's `actorId` is a
            // User.id, not the membership id.
            <SelectItem
              key={member.userId}
              value={member.userId}
              // `children` is rich content, so the registered label has to be
              // stated explicitly or the trigger would fall back to the id.
              label={member.name}
            >
              <span className="flex min-w-0 items-center gap-2">
                <ActorAvatar member={member} />
                <span className="truncate">{member.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Member avatar — image when the member has one, initials on a role-toned
 * circle otherwise (the MembersTable / ProjectKanbanCard treatment, sized for
 * a 34px trigger and the select panel's rows).
 */
function ActorAvatar({ member }: { member: WorkspaceMemberCard }) {
  if (member.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.image}
        alt=""
        className="size-[18px] shrink-0 rounded-full border border-ds-border/60 object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-[18px] shrink-0 place-items-center rounded-full font-mono text-[7px] font-bold',
        AVATAR_TONE[member.role],
      )}
    >
      {initialsOf(member.name)}
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

/** Role-toned fallback circle — mirrors the MembersTable palette. */
const AVATAR_TONE: Record<WorkspaceMemberCard['role'], string> = {
  OWNER: 'bg-ds-brand text-white',
  ADMIN: 'border border-ds-info/30 bg-ds-info-soft text-ds-info',
  MEMBER: 'border border-ds-border bg-ds-surface-subtle text-muted-foreground',
};
