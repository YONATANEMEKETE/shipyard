'use client';

import { format } from 'date-fns';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarDays,
  Flag,
  Kanban,
  LayoutList,
  Search,
  User,
} from 'lucide-react';
import { useState } from 'react';
import type React from 'react';
import type { ViewType } from '@shipyard/shared';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/motion/select';
import { useMembers } from '@/hooks/use-members';
import {
  useProjects,
  useViewPreference,
  useSetViewPreference,
} from '@/hooks/use-projects';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface ProjectFilters {
  search: string;
  ownerId?: string;
  startDate?: string;
  targetDate?: string;
  order: 'asc' | 'desc';
}

/**
 * Projects toolbar — mirrors "Projects Toolbar Row" in shipyard.pen
 * (Screen / Projects - List):
 *  - Top row: underline scope tabs (All + total count | Archived) left,
 *    List/Kanban view switch right (hidden in archived mode).
 *  - Bottom row: search + Owner / Start / Target pills + sort-direction
 *    toggle left, Clear (resets the visible filters) right. In archived
 *    mode only the search stays — the archived list is read-only.
 * The list is grouped by status, so there is no status filter; sort field
 * is fixed to newest-first server-side, the toggle flips direction only.
 * Filter state is lifted to the parent via `onChange`; the view persists
 * server-side through the view-preference API.
 */
export function ProjectsToolbar({
  slug,
  filters,
  onChange,
  archived = false,
  onArchivedChange,
}: {
  slug: string;
  filters: ProjectFilters;
  onChange: (filters: ProjectFilters) => void;
  /** Archived mode — read-only list of archived projects with Restore. */
  archived?: boolean;
  onArchivedChange?: (archived: boolean) => void;
}) {
  const { data: viewPref } = useViewPreference(slug, 'PROJECT');
  const setViewPref = useSetViewPreference(slug);

  const { data: roster } = useMembers(slug);
  // Unfiltered totals for the scope tab count badges — the API splits active
  // and archived, so each tab counts its own scope (the archived call shares
  // the parent's cache entry while archived mode is on).
  const { data: scopeCounts } = useProjects(slug);
  const { data: archivedScopeCounts } = useProjects(slug, {
    archived: 'true',
  });

  const set = (patch: Partial<ProjectFilters>) =>
    onChange({ ...filters, ...patch });

  const activeView: ViewType = viewPref?.view ?? 'LIST';

  const setView = (view: ViewType) => {
    setViewPref.mutate({ scope: 'PROJECT', view });
  };

  const clearFilters = () =>
    onChange({
      ...filters,
      search: '',
      ownerId: undefined,
      startDate: undefined,
      targetDate: undefined,
      order: 'desc',
    });

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Top row — scope tabs + view switch. */}
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        {onArchivedChange ? (
          <Tabs
            value={archived ? 'ARCHIVED' : 'ACTIVE'}
            onValueChange={(details) =>
              onArchivedChange(details.value === 'ARCHIVED')
            }
          >
            <TabsList variant="underline">
              <TabsTrigger
                value="ACTIVE"
                className="gap-1.5 aria-selected:text-ds-brand"
              >
                All
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {scopeCounts ? scopeCounts.projects.length : 0}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="ARCHIVED"
                className="gap-1.5 aria-selected:text-ds-brand"
              >
                Archived
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {archivedScopeCounts
                    ? archivedScopeCounts.projects.length
                    : 0}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}

        {/* View switch — the board is meaningless for archived projects,
            so it hides in that mode. */}
        {!archived ? (
          <Tabs
            value={activeView}
            onValueChange={(details) => setView(details.value as ViewType)}
          >
            <TabsList className="gap-0.5 border border-ds-border bg-ds-surface p-0.5">
              <TabsTrigger
                value="LIST"
                className="size-[30px] px-0"
                aria-label="List view"
                title="List view"
              >
                <LayoutList className="size-4" />
              </TabsTrigger>
              <TabsTrigger
                value="KANBAN"
                className="size-[30px] px-0"
                aria-label="Kanban view"
                title="Kanban view"
              >
                <Kanban className="size-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </div>

      {/* Bottom row — search + filter pills + sort toggle, Clear at right.
          Archived mode keeps the search only (read-only list). */}
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={filters.search}
            onChange={(value) => set({ search: value })}
            placeholder="Find projects…"
            leftIcon={<Search className="size-[14px] text-muted-foreground" />}
            classNames={{
              field:
                'h-[34px] w-full rounded-md border-ds-border bg-ds-surface sm:w-[160px]',
              input: 'text-xs',
            }}
          />

          {!archived ? (
            <>
              <Select
                value={filters.ownerId ?? 'ALL'}
                onValueChange={(value) =>
                  set({ ownerId: value === 'ALL' ? undefined : value })
                }
              >
                <SelectTrigger className="h-[34px] gap-1.5 rounded-md! border-ds-border bg-ds-surface px-3 text-xs text-foreground hover:border-ds-border">
                  <User className="size-[14px] text-muted-foreground" />
                  <OwnerPillValue
                    ownerId={filters.ownerId}
                    members={roster?.members ?? []}
                  />
                </SelectTrigger>
                <SelectContent className="w-max min-w-full">
                  <SelectItem value="ALL">All owners</SelectItem>
                  {(roster?.members ?? []).map((member) => (
                    // Use the user id (not the membership id) — the list endpoint
                    // filters Project.ownerId, which references User.id.
                    <SelectItem
                      key={member.userId}
                      value={member.userId}
                      className="whitespace-nowrap"
                    >
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <DateFilter
                value={filters.startDate}
                onChange={(value) => set({ startDate: value })}
                icon={<CalendarDays className="size-[14px]" />}
                placeholder="Start"
              />

              <DateFilter
                value={filters.targetDate}
                onChange={(value) => set({ targetDate: value })}
                icon={<Flag className="size-[14px]" />}
                placeholder="Target"
              />

              {/* Sort direction toggle — flips asc/desc. */}
              <button
                type="button"
                aria-label={`Sort ${
                  filters.order === 'asc' ? 'descending' : 'ascending'
                }`}
                title={`Sort ${filters.order === 'asc' ? 'descending' : 'ascending'}`}
                onClick={() =>
                  set({ order: filters.order === 'asc' ? 'desc' : 'asc' })
                }
                className="grid size-[34px] shrink-0 place-items-center rounded-md border border-ds-border bg-ds-surface text-muted-foreground transition-colors hover:border-ds-border hover:text-foreground"
              >
                {filters.order === 'asc' ? (
                  <ArrowUpAZ className="size-[14px]" />
                ) : (
                  <ArrowDownAZ className="size-[14px]" />
                )}
              </button>
            </>
          ) : null}
        </div>

        {!archived ? (
          <button
            type="button"
            onClick={clearFilters}
            className="shrink-0 px-1 text-xs font-medium text-ds-brand transition-colors hover:text-ds-brand/80"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Owner pill label — the filter name at rest, the member name when set. */
function OwnerPillValue({
  ownerId,
  members,
}: {
  ownerId?: string;
  members: { userId: string; name: string }[];
}) {
  const selected = ownerId
    ? members.find((m) => m.userId === ownerId)
    : undefined;
  return <span className="truncate">{selected?.name ?? 'Owner'}</span>;
}

/**
 * Date filter — a 34px pill (leading icon + label + trailing calendar icon)
 * that opens the shared `Calendar` in a `Popover`, matching the Start/Target
 * date filters in shipyard.pen. Values are serialized to the shared
 * `YYYY-MM-DD` format (`ProjectFilters`).
 */
function DateFilter({
  value,
  onChange,
  icon,
  placeholder,
}: {
  value?: string;
  onChange: (value: string | undefined) => void;
  icon: React.ReactNode;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected: Date | undefined = value
    ? new Date(`${value}T12:00:00`)
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={placeholder}
          title={value ? format(selected!, 'MMM d, yyyy') : placeholder}
          className={cn(
            'flex h-[34px] items-center gap-1.5 rounded-md border border-ds-border bg-ds-surface px-3 text-xs font-medium text-foreground transition-colors hover:border-ds-border-strong',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <span className="text-muted-foreground">{icon}</span>
          <span className="whitespace-nowrap">
            {value ? format(selected!, 'MMM d, yyyy') : placeholder}
          </span>
          <CalendarDays className="size-[14px] shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-auto border-ds-border bg-ds-surface p-0 shadow-xl"
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(date ? toYmd(date) : undefined);
            setOpen(false);
          }}
          initialFocus
        />
        <div className="flex items-center justify-between border-t border-ds-border p-2">
          <span className="pl-2 text-xs text-muted-foreground">
            {value
              ? format(new Date(`${value}T12:00:00`), 'EEEE, MMMM d, yyyy')
              : 'No date selected'}
          </span>
          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Serialize a Date to the shared `YYYY-MM-DD` format. */
function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
