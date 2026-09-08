'use client';

import { format } from 'date-fns';
import {
  Calendar as CalendarIcon,
  CheckCheck,
  ChevronLeft,
  Copy,
  Pencil,
  MessageSquare,
  History,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/motion/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Loader } from '@/components/motion/loader';
import {
  useArchiveIssue,
  useDeleteIssue,
  useIssue,
  useUpdateIssue,
} from '@/hooks/use-issues';
import { useMembers } from '@/hooks/use-members';
import { useProjects } from '@/hooks/use-projects';
import { useCycles } from '@/hooks/use-cycles';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';
import type { IssueStatus } from '@shipyard/shared';
import { useRouter } from 'next/navigation';
import { Archive, Trash2 } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toYmd } from '@/components/projects/date-picker-field';

const STATUS_OPTIONS: { value: IssueStatus; label: string; dot: string }[] = [
  { value: 'BACKLOG', label: 'Backlog', dot: 'bg-ds-text-muted' },
  { value: 'TODO', label: 'Todo', dot: 'bg-ds-info' },
  { value: 'IN_PROGRESS', label: 'In Progress', dot: 'bg-ds-brand' },
  { value: 'DONE', label: 'Done', dot: 'bg-ds-success' },
];

const PRIORITY_DOT: Record<string, string> = {
  NO_PRIORITY: 'bg-[#F0EFEB] border border-ds-border',
  URGENT: 'bg-ds-danger',
  HIGH: 'bg-ds-warning',
  MEDIUM: 'bg-ds-brand',
  LOW: 'bg-ds-info',
};

const PRIORITY_OPTIONS: { value: string; label: string; dot: string }[] = [
  {
    value: 'NO_PRIORITY',
    label: 'No priority',
    dot: 'bg-[#F0EFEB] border border-ds-border',
  },
  { value: 'URGENT', label: 'Urgent', dot: 'bg-ds-danger' },
  { value: 'HIGH', label: 'High', dot: 'bg-ds-warning' },
  { value: 'MEDIUM', label: 'Medium', dot: 'bg-ds-brand' },
  { value: 'LOW', label: 'Low', dot: 'bg-ds-info' },
];

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function IssueDetailPage({
  slug,
  issueId,
}: {
  slug: string;
  issueId: string;
}) {
  const { data: issue, isPending, isError, refetch } = useIssue(slug, issueId);
  const { showToast } = useToast();
  const updateIssue = useUpdateIssue(slug);

  const [activeTab, setActiveTab] = useState<'conversation' | 'history'>(
    'conversation',
  );
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);

  const router = useRouter();
  const { data: membersData } = useMembers(slug);
  const { data: projectsData } = useProjects(slug);
  const { data: cyclesData } = useCycles(slug);
  const hasMembers = membersData ? membersData.members.length > 0 : true;
  const hasProjects = projectsData ? projectsData.projects.length > 0 : true;
  const hasCycles = cyclesData ? cyclesData.cycles.length > 0 : true;
  const archiveIssue = useArchiveIssue(slug);
  const deleteIssue = useDeleteIssue(slug);

  if (isPending) {
    return (
      <div className="flex min-h-[400px] w-full items-center justify-center">
        <Loader size={28} variant="spinner" label="Loading issue" />
      </div>
    );
  }

  if (isError || !issue) {
    return (
      <div className="flex min-h-[400px] w-full items-center justify-center">
        <ErrorState
          title="Couldn't load issue"
          description="We ran into a problem fetching this issue."
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => refetch()}
              className="h-8 gap-2 rounded-md border-ds-border bg-ds-surface px-3 text-xs font-semibold"
            >
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const onUpdate = (
    patch: Record<string, unknown>,
    opts?: { title: string; description?: string },
  ) => {
    updateIssue.mutate(
      { issueId: issue.id, body: patch as never },
      {
        onSuccess: () => {
          if (opts)
            showToast({
              status: 'success',
              title: opts.title,
              description: opts.description,
            });
        },
        onError: (e) =>
          showToast({
            status: 'error',
            title: 'Update failed',
            description: (e as Error).message,
          }),
      },
    );
  };

  const cycleName = issue.cycleId
    ? (cyclesData?.cycles.find((c) => c.id === issue.cycleId)?.name ??
      issue.cycleId)
    : null;
  const projectName = issue.projectId
    ? (projectsData?.projects.find((p) => p.id === issue.projectId)?.name ??
      issue.projectId)
    : null;

  const copyLink = async () => {
    const url = `${window.location.origin}/w/${slug}/issues/${issue.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // silent — inline affordance only, no toast per design
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-5">
      {/* Header — Breadcrumb Row + Title Row + Meta + Divider per XyWG3 */}
      <div className="flex w-full flex-col gap-3">
        <div className="flex w-full items-center justify-between gap-3">
          <Link
            href={`/w/${slug}/issues`}
            className="inline-flex items-center gap-1 text-xs font-medium text-ds-text-muted hover:text-foreground"
          >
            <ChevronLeft className="size-3.5 shrink-0" />
            Back to Issues
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex h-[22px] items-center justify-center rounded-sm border border-ds-border bg-ds-surface-subtle px-2 font-mono text-[10px] font-semibold leading-none text-ds-text-muted">
              {issue.identifier}
            </span>
            <button
              type="button"
              aria-label={copied ? 'Copied' : 'Copy issue link'}
              onClick={copyLink}
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground"
            >
              {copied ? (
                <CheckCheck className="size-[13px] text-ds-success" />
              ) : (
                <Copy className="size-[13px]" />
              )}
            </button>
          </div>
        </div>

        <div className="flex w-full items-center gap-2">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                if (titleDraft.trim() && titleDraft !== issue.title)
                  onUpdate(
                    { title: titleDraft.trim() },
                    {
                      title: `Renamed ${issue.identifier}`,
                      description: `"${titleDraft.trim()}"`,
                    },
                  );
                setEditingTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (titleDraft.trim() && titleDraft !== issue.title)
                    onUpdate(
                      { title: titleDraft.trim() },
                      {
                        title: `Renamed ${issue.identifier}`,
                        description: `"${titleDraft.trim()}"`,
                      },
                    );
                  setEditingTitle(false);
                }
                if (e.key === 'Escape') setEditingTitle(false);
              }}
              className="w-full bg-transparent text-[26px] font-bold leading-[1.15] tracking-[-0.5px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              placeholder="Issue title"
            />
          ) : (
            <>
              <h1 className="text-[26px] font-bold leading-[1.15] tracking-[-0.5px] text-foreground">
                {issue.title}
              </h1>
              <button
                type="button"
                aria-label="Edit title"
                onClick={() => {
                  setTitleDraft(issue.title);
                  setEditingTitle(true);
                }}
                className="grid size-7 shrink-0 place-items-center rounded-md text-ds-text-muted transition-colors hover:bg-ds-bg hover:text-foreground"
              >
                <Pencil className="size-3.5" />
              </button>
            </>
          )}
        </div>

        <p className="text-xs text-ds-text-muted">
          Created by {issue.creator.name} on{' '}
          {format(new Date(issue.createdAt), 'MMM d, yyyy')}
        </p>
        <div className="h-px w-full bg-ds-border" aria-hidden />
      </div>

      <div className="flex w-full min-h-0 flex-1 gap-6">
        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex w-full flex-col gap-2">
            <div className="flex w-full items-center justify-between">
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[1px] text-muted-foreground">
                Description
              </span>
              <button
                type="button"
                aria-label="Edit description"
                onClick={() => {
                  setDescDraft(issue.description ?? '');
                  setEditingDesc((v) => !v);
                }}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-ds-bg hover:text-foreground"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
            {editingDesc ? (
              <textarea
                autoFocus
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onUpdate(
                      { description: descDraft || null },
                      {
                        title: 'Description updated',
                        description: `${issue.identifier} — description saved`,
                      },
                    );
                    setEditingDesc(false);
                  }
                  if (e.key === 'Escape') setEditingDesc(false);
                }}
                onBlur={() => {
                  if (descDraft !== (issue.description ?? ''))
                    onUpdate(
                      { description: descDraft || null },
                      {
                        title: 'Description updated',
                        description: `${issue.identifier} — description saved`,
                      },
                    );
                  setEditingDesc(false);
                }}
                rows={4}
                placeholder="Add description…"
                className="w-full resize-none bg-transparent text-[13px] leading-[1.6] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            ) : (
              <p className="whitespace-pre-wrap text-[13px] leading-[1.6] text-foreground">
                {issue.description ? (
                  issue.description
                ) : (
                  <span className="text-muted-foreground">
                    No description yet.
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="h-px w-full bg-ds-border" aria-hidden />

          <div className="flex w-full flex-col gap-3">
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as never)}
            >
              <TabsList variant="underline" className="gap-6">
                <TabsTrigger
                  value="conversation"
                  className="gap-1.5 data-[state=active]:text-ds-brand"
                >
                  <MessageSquare className="size-3.5" />
                  Conversation
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-1.5">
                  <History className="size-3.5" />
                  History
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {activeTab === 'conversation' ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ds-border bg-ds-surface-subtle p-8 text-center">
                <MessageSquare className="size-5 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  No conversation yet
                </p>
                <p className="max-w-[320px] text-xs leading-relaxed text-muted-foreground">
                  Comments will appear here. For now this tab is empty.
                </p>
              </div>
            ) : (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ds-border bg-ds-surface-subtle p-8 text-center">
                <History className="size-5 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  No history yet
                </p>
                <p className="max-w-[320px] text-xs leading-relaxed text-muted-foreground">
                  All status, assignment and property changes will be listed
                  here.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Properties rail — Details + spacer + Lifecycle per QASC1/Akitx */}
        <div className="hidden w-[320px] shrink-0 flex-col gap-4 self-stretch lg:flex min-h-0">
          <div className="flex flex-col gap-3">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[1px] text-muted-foreground">
              Details
            </span>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Status</span>
              <Select
                value={issue.status}
                onValueChange={(v) => {
                  const label =
                    STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
                  onUpdate(
                    { status: v },
                    {
                      title: `Moved to ${label}`,
                      description: issue.identifier,
                    },
                  );
                }}
                disabled={updateIssue.isPending}
              >
                <SelectTrigger className="h-8 w-[160px] justify-between rounded-md border-ds-border bg-ds-surface px-2.5 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={cn(
                        'size-2 rounded-full',
                        STATUS_OPTIONS.find((o) => o.value === issue.status)
                          ?.dot,
                      )}
                    />
                    {
                      STATUS_OPTIONS.find((o) => o.value === issue.status)
                        ?.label
                    }
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className={cn('size-2 rounded-full', o.dot)}
                        />
                        {o.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Priority</span>
              <Select
                value={issue.priority}
                onValueChange={(v) => {
                  const label =
                    PRIORITY_OPTIONS.find((o) => o.value === v)?.label ?? v;
                  onUpdate(
                    { priority: v },
                    {
                      title: `Priority set to ${label}`,
                      description: issue.identifier,
                    },
                  );
                }}
                disabled={updateIssue.isPending}
              >
                <SelectTrigger className="h-auto w-auto gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-foreground shadow-none hover:bg-transparent focus-visible:ring-0">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={cn(
                        'size-[7px] rounded-full',
                        PRIORITY_DOT[issue.priority] ?? 'bg-ds-border',
                      )}
                    />
                    <span>
                      {PRIORITY_OPTIONS.find((o) => o.value === issue.priority)
                        ?.label ?? issue.priority}
                    </span>
                  </span>
                </SelectTrigger>
                <SelectContent className="!left-auto right-0 min-w-[160px] w-auto">
                  {PRIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className={cn('size-2 rounded-full', o.dot)}
                        />
                        {o.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Assignee</span>
              <Select
                value={issue.assignee?.userId ?? 'UNASSIGNED'}
                onValueChange={(v) => {
                  if (v === 'UNASSIGNED')
                    onUpdate(
                      { assigneeId: null },
                      {
                        title: 'Unassigned',
                        description: `${issue.identifier} — no assignee`,
                      },
                    );
                  else {
                    const name =
                      membersData?.members?.find((m) => m.userId === v)?.name ??
                      'Assignee';
                    onUpdate(
                      { assigneeId: v },
                      {
                        title: `Assigned to ${name}`,
                        description: issue.identifier,
                      },
                    );
                  }
                }}
                disabled={updateIssue.isPending || !hasMembers}
              >
                <SelectTrigger className="h-auto w-auto gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-foreground shadow-none hover:bg-transparent focus-visible:ring-0">
                  <span className="flex items-center gap-1.5 truncate">
                    {issue.assignee ? (
                      issue.assignee.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={issue.assignee.image}
                          alt={issue.assignee.name}
                          className="size-4 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="grid size-4 shrink-0 place-items-center rounded-full bg-ds-brand font-mono text-[7px] font-bold text-white">
                          {initialsOf(issue.assignee.name)}
                        </span>
                      )
                    ) : (
                      <span
                        className="size-4 shrink-0 rounded-full bg-ds-border"
                        aria-hidden
                      />
                    )}
                    <span className="max-w-[120px] truncate">
                      {issue.assignee?.name ?? 'Unassigned'}
                    </span>
                  </span>
                </SelectTrigger>
                <SelectContent className="!left-auto right-0 min-w-[180px] w-auto">
                  <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                  {(membersData?.members ?? []).map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      <span className="flex items-center gap-2">
                        {m.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.image}
                            alt={m.name}
                            className="size-4 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-ds-brand font-mono text-[7px] font-bold text-white">
                            {initialsOf(m.name)}
                          </span>
                        )}
                        {m.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Project</span>
              <Select
                value={issue.projectId ?? 'NO_PROJECT'}
                onValueChange={(v) => {
                  if (v === 'NO_PROJECT')
                    onUpdate(
                      { projectId: null },
                      {
                        title: 'Removed from project',
                        description: issue.identifier,
                      },
                    );
                  else {
                    const name =
                      projectsData?.projects.find((p) => p.id === v)?.name ??
                      'project';
                    onUpdate(
                      { projectId: v },
                      {
                        title: `Moved to ${name}`,
                        description: issue.identifier,
                      },
                    );
                  }
                }}
                disabled={updateIssue.isPending || !hasProjects}
              >
                <SelectTrigger className="h-auto w-auto gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-foreground shadow-none hover:bg-transparent focus-visible:ring-0">
                  <span className="truncate">
                    {projectName ?? 'No project'}
                  </span>
                </SelectTrigger>
                <SelectContent className="!left-auto right-0 min-w-[180px] w-auto">
                  <SelectItem value="NO_PROJECT">No project</SelectItem>
                  {(projectsData?.projects ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Cycle</span>
              <Select
                value={issue.cycleId ?? 'NO_CYCLE'}
                onValueChange={(v) => {
                  if (v === 'NO_CYCLE')
                    onUpdate(
                      { cycleId: null },
                      {
                        title: 'Removed from cycle',
                        description: issue.identifier,
                      },
                    );
                  else {
                    const name =
                      cyclesData?.cycles.find((c) => c.id === v)?.name ??
                      'cycle';
                    onUpdate(
                      { cycleId: v },
                      {
                        title: `Added to ${name}`,
                        description: issue.identifier,
                      },
                    );
                  }
                }}
                disabled={updateIssue.isPending || !hasCycles}
              >
                <SelectTrigger className="h-auto w-auto gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-foreground shadow-none hover:bg-transparent focus-visible:ring-0">
                  <span className="truncate">{cycleName ?? 'No cycle'}</span>
                </SelectTrigger>
                <SelectContent className="!left-auto right-0 min-w-[180px] w-auto">
                  <SelectItem value="NO_CYCLE">No cycle</SelectItem>
                  {(cyclesData?.cycles ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Labels</span>
              <div className="flex max-w-[160px] flex-wrap justify-end gap-1.5">
                {issue.labels.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    No labels
                  </span>
                ) : (
                  issue.labels.map((l) => (
                    <span
                      key={l.id}
                      className="inline-flex h-5 items-center gap-1 rounded-full bg-ds-surface-subtle px-2 text-[10px] font-medium text-foreground"
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: l.color }}
                        aria-hidden
                      />
                      {l.name}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Due date</span>
              <Popover open={dueOpen} onOpenChange={setDueOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={updateIssue.isPending}
                    className="inline-flex h-auto items-center gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-0 disabled:opacity-50"
                  >
                    <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    {issue.dueDate
                      ? format(
                          new Date(`${issue.dueDate}T12:00:00`),
                          'MMM d, yyyy',
                        )
                      : 'No due date'}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={8}
                  className="w-auto border-ds-border bg-ds-surface p-0 shadow-xl"
                >
                  <Calendar
                    mode="single"
                    selected={
                      issue.dueDate
                        ? new Date(`${issue.dueDate}T12:00:00`)
                        : undefined
                    }
                    onSelect={(d) => {
                      if (d) {
                        const label = format(
                          new Date(`${toYmd(d)}T12:00:00`),
                          'MMM d, yyyy',
                        );
                        onUpdate(
                          { dueDate: toYmd(d) },
                          {
                            title: `Due ${label}`,
                            description: issue.identifier,
                          },
                        );
                      } else
                        onUpdate(
                          { dueDate: null },
                          {
                            title: 'Due date cleared',
                            description: issue.identifier,
                          },
                        );
                      setDueOpen(false);
                    }}
                    initialFocus
                  />
                  {issue.dueDate ? (
                    <div className="flex justify-end border-t border-ds-border p-2">
                      <button
                        type="button"
                        onClick={() => {
                          onUpdate(
                            { dueDate: null },
                            {
                              title: 'Due date cleared',
                              description: issue.identifier,
                            },
                          );
                          setDueOpen(false);
                        }}
                        className="rounded-md px-2 py-1 text-xs hover:bg-muted"
                      >
                        Clear
                      </button>
                    </div>
                  ) : null}
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Blocked</span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <span
                  className={cn(
                    'size-2 rounded-full',
                    issue.blocked ? 'bg-ds-danger' : 'bg-ds-text-muted',
                  )}
                  aria-hidden
                />
                {issue.blocked ? 'Yes' : 'No'}
              </span>
            </div>

            <div className="h-px w-full bg-ds-border" aria-hidden />
            <span className="text-[11px] text-muted-foreground">
              Updated {format(new Date(issue.updatedAt), 'MMM d, yyyy')}
            </span>
          </div>

          <div className="flex-1" aria-hidden />

          <div className="flex flex-col gap-1">
            <div className="h-px w-full bg-ds-border" aria-hidden />
            <button
              type="button"
              onClick={() => {
                archiveIssue.mutate(
                  { issueId: issue.id },
                  {
                    onSuccess: () => {
                      showToast({
                        status: 'success',
                        title: 'Issue archived',
                        description: issue.identifier,
                      });
                      router.push(`/w/${slug}/issues`);
                    },
                    onError: (e) =>
                      showToast({
                        status: 'error',
                        title: 'Archive failed',
                        description: (e as Error).message,
                      }),
                  },
                );
              }}
              disabled={archiveIssue.isPending || !!issue.archivedAt}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-ds-bg hover:text-foreground disabled:opacity-50"
            >
              <Archive className="size-3.5 shrink-0" />
              {issue.archivedAt ? 'Archived' : 'Archive issue'}
            </button>
            <button
              type="button"
              onClick={() => {
                const confirm = window.prompt(
                  `Type ${issue.identifier} to confirm delete`,
                );
                if (confirm !== issue.identifier) {
                  if (confirm !== null)
                    showToast({
                      status: 'error',
                      title: 'Confirmation failed',
                      description: `Type ${issue.identifier} exactly`,
                    });
                  return;
                }
                deleteIssue.mutate(
                  {
                    issueId: issue.id,
                    body: { confirmIdentifier: issue.identifier },
                  },
                  {
                    onSuccess: () => {
                      showToast({
                        status: 'success',
                        title: 'Issue deleted',
                        description: issue.identifier,
                      });
                      router.push(`/w/${slug}/issues`);
                    },
                    onError: (e) =>
                      showToast({
                        status: 'error',
                        title: 'Delete failed',
                        description: (e as Error).message,
                      }),
                  },
                );
              }}
              disabled={deleteIssue.isPending}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12.5px] font-medium text-ds-danger hover:bg-ds-danger-soft"
            >
              <Trash2 className="size-3.5 shrink-0" />
              Delete issue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
