'use client';

import { format } from 'date-fns';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarDays,
  CalendarRange,
  Filter,
  Kanban,
  LayoutList,
  Search,
  User,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type React from 'react';
import type { ProjectStatus, ViewType } from '@shipyard/shared';
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
  SelectValue,
} from '@/components/motion/select';
import { useMembers } from '@/hooks/use-members';
import { useViewPreference, useSetViewPreference } from '@/hooks/use-projects';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface ProjectFilters {
  search: string;
  status?: ProjectStatus;
  ownerId?: string;
  startDate?: string;
  targetDate?: string;
  sort: 'createdAt' | 'name' | 'targetDate' | 'startDate' | 'status';
  order: 'asc' | 'desc';
}

const SORT_OPTIONS: { value: ProjectFilters['sort']; label: string }[] = [
  { value: 'createdAt', label: 'Newest' },
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'startDate', label: 'Start date' },
  { value: 'targetDate', label: 'Target date' },
];

/**
 * Projects toolbar — mirrors "Projects Toolbar Row" in shipyard.pen (List and
 * Kanban screens): search left, then the List/Kanban view switch and the
 * filter/sort controls right.
 *  - Search: h-9 rounded-md surface input, muted "Find projects…" placeholder.
 *  - View switch: Tabs (TabsList/TabsTrigger) with List/Kanban icon triggers,
 *    matching the Members page tab pattern. The choice persists per-workspace
 *    through the view-preference API (rule 12: LIST is the default).
 *  - Filters: Status / Owner / Start date / Target date pills (motion Select)
 *    and a Sort dropdown. Owner options come from the workspace roster.
 * Filter state is lifted to the parent via `onFiltersChange` so the list/board
 * view can consume it; the view is persisted server-side.
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

  const set = (patch: Partial<ProjectFilters>) =>
    onChange({ ...filters, ...patch });

  const activeView: ViewType = viewPref?.view ?? 'LIST';

  const setView = (view: ViewType) => {
    setViewPref.mutate({ scope: 'PROJECT', view });
  };

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      {/* Search — Projects Toolbar Left */}
      <Input
        value={filters.search}
        onChange={(value) => set({ search: value })}
        placeholder="Find projects…"
        leftIcon={<Search className="size-[14px] text-muted-foreground" />}
        classNames={{
          field: 'h-[34px] w-[240px] rounded-lg border-ds-border bg-ds-surface',
          input: 'text-xs',
        }}
      />

      {/* View switch + filter controls — Projects Toolbar Right */}
      <div className="flex items-center gap-3">
        {/* Active / Archived scope — archived is a read-only list (no board,
            no filters), so the rest of the controls hide while it's on. */}
        {onArchivedChange ? (
          <div className="flex items-center rounded-lg border border-ds-border bg-ds-surface p-0.5">
            <button
              type="button"
              onClick={() => onArchivedChange(false)}
              className={cn(
                'h-[26px] rounded-md px-2.5 text-[11px] font-semibold transition-colors',
                !archived
                  ? 'bg-ds-bg text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => onArchivedChange(true)}
              className={cn(
                'h-[26px] rounded-md px-2.5 text-[11px] font-semibold transition-colors',
                archived
                  ? 'bg-ds-bg text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Archived
            </button>
          </div>
        ) : null}

        {/* View switch — Tabs (mirrors Members page tab pattern). The board
            is meaningless for archived projects, so it hides in that mode. */}
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

        {/* Filter + sort controls — hidden in archived mode (read-only). */}
        {!archived ? (
          <div className="flex items-center gap-2">
            {/* Status is a list-only concept — the board always shows every
                status, so the pill is hidden (not just ignored) in Kanban. */}
            {activeView === 'LIST' ? (
              <Select
                value={filters.status ?? 'ALL'}
                onValueChange={(value) =>
                  set({
                    status:
                      value === 'ALL' ? undefined : (value as ProjectStatus),
                  })
                }
              >
                <SelectTrigger className="h-[34px] gap-1.5 border-ds-border bg-ds-surface px-3 text-xs text-muted-foreground hover:border-ds-border">
                  <Filter className="size-[14px]" />
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="PLANNED">Planned</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                </SelectContent>
              </Select>
            ) : null}

            <Select
              value={filters.ownerId ?? 'ALL'}
              onValueChange={(value) =>
                set({ ownerId: value === 'ALL' ? undefined : value })
              }
            >
              <SelectTrigger className="h-[34px] gap-1.5 border-ds-border bg-ds-surface px-3 text-xs text-muted-foreground hover:border-ds-border">
                <User className="size-[14px]" />
                <SelectValue placeholder="All owners" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All owners</SelectItem>
                {(roster?.members ?? []).map((member) => (
                  // Use the user id (not the membership id) — the list endpoint
                  // filters Project.ownerId, which references User.id.
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DateFilter
              value={filters.startDate}
              onChange={(value) => set({ startDate: value })}
              icon={<CalendarDays className="size-[14px]" />}
              placeholder="Any start"
            />

            <DateFilter
              value={filters.targetDate}
              onChange={(value) => set({ targetDate: value })}
              icon={<CalendarRange className="size-[14px]" />}
              placeholder="Any target"
            />

            <Select
              value={filters.sort}
              onValueChange={(value) =>
                set({ sort: value as ProjectFilters['sort'] })
              }
            >
              <SelectTrigger className="h-[34px] gap-1.5 border-ds-border bg-ds-surface px-3 text-xs text-muted-foreground hover:border-ds-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort direction toggle — flips asc/desc (previously decorative). */}
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
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Date filter — a compact 34px pill (calendar icon + label) that opens the
 * shared `Calendar` in a `Popover`, matching the Start/Target date filters in
 * shipyard.pen and the date picker used in the Create Project dialog. Values
 * are serialized to the shared `YYYY-MM-DD` format (`ProjectFilters`).
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
            'flex h-[34px] items-center gap-1.5 rounded-md border px-3 text-xs transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value
              ? 'border-ds-brand/40 bg-ds-brand-soft text-ds-brand'
              : 'border-ds-border bg-ds-surface text-muted-foreground hover:border-ds-border',
          )}
        >
          <span className={cn(value && 'text-ds-brand')}>{icon}</span>
          <span className="whitespace-nowrap">
            {value ? format(selected!, 'MMM d, yyyy') : placeholder}
          </span>
          {value ? (
            <span
              role="button"
              aria-label={`Clear ${placeholder}`}
              className="ml-0.5 grid size-4 shrink-0 place-items-center rounded-sm text-current/70 hover:bg-ds-brand/10"
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
            >
              <X className="size-3" />
            </span>
          ) : null}
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
