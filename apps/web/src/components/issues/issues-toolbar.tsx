'use client';

import { format } from 'date-fns';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Calendar,
  CalendarDays,
  Flag,
  Folder,
  Kanban,
  LayoutList,
  OctagonAlert,
  Search,
  Tag,
  User,
} from 'lucide-react';
import { useState } from 'react';
import type { IssuePriority } from '@shipyard/shared';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Calendar as CalendarPrimitive } from '@/components/ui/calendar';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMembers } from '@/hooks/use-members';
import { useLabels } from '@/hooks/use-issues';
import {
  useProjects,
  useViewPreference,
  useSetViewPreference,
} from '@/hooks/use-projects';
import type { ViewType } from '@shipyard/shared';

export type IssueScope = 'ALL' | 'MY' | 'ARCHIVED';

export interface IssueFilters {
  search: string;
  priority?: IssuePriority;
  assigneeId?: string;
  projectId?: string;
  labelId?: string;
  dueDate?: string;
  /** Orthogonal blocked flag — `?blocked=` on the list endpoint (spec §3.5). */
  blocked?: 'true' | 'false';
  order: 'asc' | 'desc';
}

const PRIORITY_OPTIONS: { value: IssuePriority; label: string }[] = [
  { value: 'URGENT', label: 'Urgent' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
  { value: 'NO_PRIORITY', label: 'No priority' },
];

const PRIORITY_LABEL: Record<IssuePriority, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NO_PRIORITY: 'No priority',
};

/**
 * Issues toolbar — mirrors "Issues Toolbar Row" in shipyard.pen.
 * Mirrors ProjectsToolbar live pattern:
 *  - Top row: underline scope tabs (All/My/Archived) + view switch (ISSUE scope, persisted).
 *  - Bottom row: search + Priority / Assignee / Project / Labels / Due pills + sort toggle + Clear.
 * Filter state is lifted to the parent via `onChange`; pills are live Select/Popover backed by
 * real roster/labels/projects data. Archived scope keeps search only.
 */
export function IssuesToolbar({
  slug,
  filters,
  onChange,
  scope = 'ALL',
  onScopeChange,
  counts,
}: {
  slug: string;
  filters: IssueFilters;
  onChange: (filters: IssueFilters) => void;
  scope?: IssueScope;
  onScopeChange?: (scope: IssueScope) => void;
  counts?: Partial<Record<IssueScope, number>>;
}) {
  const { data: viewPref } = useViewPreference(slug, 'ISSUE');
  const setViewPref = useSetViewPreference(slug);
  const { data: roster } = useMembers(slug);
  const { data: projectsData } = useProjects(slug);
  const { data: labelsData } = useLabels(slug);

  const set = (patch: Partial<IssueFilters>) =>
    onChange({ ...filters, ...patch });

  const activeView: ViewType = viewPref?.view ?? 'LIST';
  const setView = (view: ViewType) =>
    setViewPref.mutate({ scope: 'ISSUE', view });

  const clearFilters = () =>
    onChange({
      search: '',
      priority: undefined,
      assigneeId: undefined,
      projectId: undefined,
      labelId: undefined,
      dueDate: undefined,
      blocked: undefined,
      order: 'desc',
    });

  const hasActiveFilters =
    filters.search !== '' ||
    filters.priority !== undefined ||
    filters.assigneeId !== undefined ||
    filters.projectId !== undefined ||
    filters.labelId !== undefined ||
    filters.dueDate !== undefined ||
    filters.blocked !== undefined ||
    filters.order !== 'desc';

  const scopeTabs: { value: IssueScope; label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: 'MY', label: 'My' },
    { value: 'ARCHIVED', label: 'Archived' },
  ];

  const isArchived = scope === 'ARCHIVED';

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Top row — scope tabs + view switch */}
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <Tabs
          value={scope}
          onValueChange={(details) =>
            onScopeChange?.(details.value as IssueScope)
          }
        >
          <TabsList variant="underline">
            {scopeTabs.map((tab) => {
              const count = counts?.[tab.value];
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={
                    tab.value === 'ARCHIVED'
                      ? undefined
                      : 'gap-1.5 aria-selected:text-ds-brand'
                  }
                >
                  {tab.label}
                  {count !== undefined ? (
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {count}
                    </span>
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        {!isArchived ? (
          <Tabs
            value={activeView}
            onValueChange={(details) => setView(details.value as ViewType)}
          >
            <TabsList className="h-[34px] gap-0.5 rounded-md border border-ds-border bg-ds-surface-subtle p-[3px]">
              <TabsTrigger
                value="LIST"
                className="size-7 px-0"
                aria-label="List view"
                title="List view"
              >
                <LayoutList className="size-3.5" />
              </TabsTrigger>
              <TabsTrigger
                value="KANBAN"
                className="size-7 px-0"
                aria-label="Kanban view"
                title="Kanban view"
              >
                <Kanban className="size-3.5" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </div>

      {/* Bottom row — search + pills + sort, Clear at right */}
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={filters.search}
            onChange={(value) => set({ search: value })}
            placeholder="Find issues…"
            leftIcon={<Search className="size-[15px] text-ds-text-muted" />}
            classNames={{
              field:
                'h-[34px] w-full rounded-md border-ds-border bg-ds-surface sm:w-[160px]',
              input: 'text-xs',
            }}
          />

          {!isArchived ? (
            <>
              <Select
                value={filters.priority ?? 'ALL'}
                onValueChange={(value) =>
                  set({
                    priority:
                      value === 'ALL' ? undefined : (value as IssuePriority),
                  })
                }
              >
                <SelectTrigger className="h-[34px] gap-1.5 rounded-md! border-ds-border bg-ds-surface px-3 text-xs text-foreground hover:border-ds-border">
                  <Flag className="size-[14px] text-muted-foreground" />
                  <span className="truncate">
                    {filters.priority
                      ? PRIORITY_LABEL[filters.priority]
                      : 'Priority'}
                  </span>
                </SelectTrigger>
                <SelectContent className="w-max min-w-full">
                  <SelectItem value="ALL">All priorities</SelectItem>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      className="whitespace-nowrap"
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.blocked ?? 'ALL'}
                onValueChange={(value) =>
                  set({
                    blocked:
                      value === 'ALL' ? undefined : (value as 'true' | 'false'),
                  })
                }
              >
                <SelectTrigger
                  className={cn(
                    'h-[34px] gap-1.5 rounded-md! border-ds-border bg-ds-surface px-3 text-xs hover:border-ds-border',
                    filters.blocked === 'true'
                      ? 'text-ds-danger'
                      : 'text-foreground',
                  )}
                >
                  <OctagonAlert
                    className={cn(
                      'size-[14px]',
                      filters.blocked === 'true'
                        ? 'text-ds-danger'
                        : 'text-muted-foreground',
                    )}
                  />
                  <span className="truncate">
                    {filters.blocked === 'true'
                      ? 'Blocked'
                      : filters.blocked === 'false'
                        ? 'Not blocked'
                        : 'Blocked'}
                  </span>
                </SelectTrigger>
                <SelectContent className="w-max min-w-full">
                  <SelectItem value="ALL">Any blocked state</SelectItem>
                  <SelectItem value="true" className="whitespace-nowrap">
                    Blocked
                  </SelectItem>
                  <SelectItem value="false" className="whitespace-nowrap">
                    Not blocked
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.assigneeId ?? 'ALL'}
                onValueChange={(value) =>
                  set({ assigneeId: value === 'ALL' ? undefined : value })
                }
              >
                <SelectTrigger className="h-[34px] gap-1.5 rounded-md! border-ds-border bg-ds-surface px-3 text-xs text-foreground hover:border-ds-border">
                  <User className="size-[14px] text-muted-foreground" />
                  <AssigneePillValue
                    assigneeId={filters.assigneeId}
                    members={roster?.members ?? []}
                  />
                </SelectTrigger>
                <SelectContent className="w-max min-w-full">
                  <SelectItem value="ALL">All assignees</SelectItem>
                  {(roster?.members ?? []).map((member) => (
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

              <Select
                value={filters.projectId ?? 'ALL'}
                onValueChange={(value) =>
                  set({ projectId: value === 'ALL' ? undefined : value })
                }
              >
                <SelectTrigger className="h-[34px] gap-1.5 rounded-md! border-ds-border bg-ds-surface px-3 text-xs text-foreground hover:border-ds-border">
                  <Folder className="size-[14px] text-muted-foreground" />
                  <ProjectPillValue
                    projectId={filters.projectId}
                    projects={projectsData?.projects ?? []}
                  />
                </SelectTrigger>
                <SelectContent className="w-max min-w-full">
                  <SelectItem value="ALL">All projects</SelectItem>
                  {(projectsData?.projects ?? []).map((project) => (
                    <SelectItem
                      key={project.id}
                      value={project.id}
                      className="whitespace-nowrap"
                    >
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.labelId ?? 'ALL'}
                onValueChange={(value) =>
                  set({ labelId: value === 'ALL' ? undefined : value })
                }
              >
                <SelectTrigger className="h-[34px] gap-1.5 rounded-md! border-ds-border bg-ds-surface px-3 text-xs text-foreground hover:border-ds-border">
                  <Tag className="size-[14px] text-muted-foreground" />
                  <LabelPillValue
                    labelId={filters.labelId}
                    labels={labelsData?.labels ?? []}
                  />
                </SelectTrigger>
                <SelectContent className="w-max min-w-full">
                  <SelectItem value="ALL">All labels</SelectItem>
                  {(labelsData?.labels ?? []).map((label) => (
                    <SelectItem
                      key={label.id}
                      value={label.id}
                      className="whitespace-nowrap"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: label.color }}
                          aria-hidden
                        />
                        {label.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <DueDateFilter
                value={filters.dueDate}
                onChange={(value) => set({ dueDate: value })}
              />

              <button
                type="button"
                aria-label={`Sort ${filters.order === 'asc' ? 'descending' : 'ascending'}`}
                title={`Sort ${filters.order === 'asc' ? 'descending' : 'ascending'}`}
                onClick={() =>
                  set({ order: filters.order === 'asc' ? 'desc' : 'asc' })
                }
                className="grid size-[34px] shrink-0 place-items-center rounded-md border border-ds-border bg-ds-surface text-muted-foreground transition-colors hover:border-ds-border-strong hover:text-foreground"
              >
                {filters.order === 'asc' ? (
                  <ArrowUpAZ className="size-[15px]" />
                ) : (
                  <ArrowDownAZ className="size-[15px]" />
                )}
              </button>
            </>
          ) : null}
        </div>

        {!isArchived && hasActiveFilters ? (
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

function AssigneePillValue({
  assigneeId,
  members,
}: {
  assigneeId?: string;
  members: { userId: string; name: string }[];
}) {
  const selected = assigneeId
    ? members.find((m) => m.userId === assigneeId)
    : undefined;
  return <span className="truncate">{selected?.name ?? 'Assignee'}</span>;
}

function ProjectPillValue({
  projectId,
  projects,
}: {
  projectId?: string;
  projects: { id: string; name: string }[];
}) {
  const selected = projectId
    ? projects.find((p) => p.id === projectId)
    : undefined;
  return <span className="truncate">{selected?.name ?? 'Project'}</span>;
}

function LabelPillValue({
  labelId,
  labels,
}: {
  labelId?: string;
  labels: { id: string; name: string }[];
}) {
  const selected = labelId ? labels.find((l) => l.id === labelId) : undefined;
  return <span className="truncate">{selected?.name ?? 'Labels'}</span>;
}

function DueDateFilter({
  value,
  onChange,
}: {
  value?: string;
  onChange: (value: string | undefined) => void;
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
          aria-label="Due date"
          title={value ? format(selected!, 'MMM d, yyyy') : 'Due'}
          className={cn(
            'flex h-[34px] items-center gap-1.5 rounded-md border border-ds-border bg-ds-surface px-3 text-xs font-medium text-foreground transition-colors hover:border-ds-border-strong',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <Calendar className="size-[14px] text-muted-foreground" />
          <span className="whitespace-nowrap">
            {value ? format(selected!, 'MMM d, yyyy') : 'Due'}
          </span>
          <CalendarDays className="size-[14px] shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-auto border-ds-border bg-ds-surface p-0 shadow-xl"
      >
        <CalendarPrimitive
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

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
