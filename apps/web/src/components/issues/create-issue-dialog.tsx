'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import {
  Calendar as CalendarIcon,
  ChevronRight,
  Plus,
  X,
  Tag,
  RefreshCcw,
  Folder,
  User,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { ReactNode } from 'react';

import {
  createIssueSchema,
  type CreateIssueRequest,
  type IssuePriority,
  type IssueStatus,
} from '@shipyard/shared';
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
import { StatefulButton } from '@/components/motion/button/stateful';
import { toYmd } from '@/components/projects/date-picker-field';
import { useCreateIssue, useLabels, useUpdateIssue } from '@/hooks/use-issues';
import { useMembers } from '@/hooks/use-members';
import { useProjects } from '@/hooks/use-projects';
import { useCycles } from '@/hooks/use-cycles';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

export interface CreateIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  defaultStatus?: IssueStatus;
}

const STATUS_OPTIONS: { value: IssueStatus; label: string; dot: string }[] = [
  { value: 'BACKLOG', label: 'Backlog', dot: 'bg-ds-text-muted' },
  { value: 'TODO', label: 'Todo', dot: 'bg-ds-info' },
  { value: 'IN_PROGRESS', label: 'In Progress', dot: 'bg-ds-brand' },
  { value: 'DONE', label: 'Done', dot: 'bg-ds-success' },
];

const PRIORITY_OPTIONS: { value: IssuePriority; label: string; dot: string }[] =
  [
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

function Pill({
  children,
  className,
  invalid,
}: {
  children: ReactNode;
  className?: string;
  invalid?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border bg-ds-surface-subtle px-3 text-xs font-medium text-foreground',
        invalid ? 'border-destructive' : 'border-ds-border',
        className,
      )}
    >
      {children}
    </span>
  );
}

function DatePill({
  value,
  onChange,
  placeholder,
  invalid,
  disabled,
}: {
  value?: string | null;
  onChange: (v: string | null | undefined) => void;
  placeholder: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T12:00:00`) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={placeholder}
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border bg-ds-surface-subtle px-3 text-xs font-medium transition-colors hover:border-ds-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
            invalid ? 'border-destructive' : 'border-ds-border',
            value ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
          {value ? format(new Date(`${value}T12:00:00`), 'MMM d') : placeholder}
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
          onSelect={(d) => {
            onChange(d ? toYmd(d) : null);
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function LabelsPill({
  value,
  onChange,
  slug,
  invalid,
  disabled,
  onExternalOpenChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  slug: string;
  invalid?: boolean;
  disabled?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onExternalOpenChange?.(next);
  };
  const { data } = useLabels(slug);
  const labels = data?.labels ?? [];
  const hasLabels = data ? labels.length > 0 : true;
  const selected = labels.filter((l) => value.includes(l.id));
  const labelText =
    selected.length === 0 ? 'Labels' : selected.map((l) => l.name).join(', ');
  const isDisabled = disabled || !hasLabels;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={isDisabled}
          aria-label="Labels"
          className={cn(
            'inline-flex h-7 max-w-[180px] shrink-0 items-center gap-1.5 rounded-full border bg-ds-surface-subtle px-3 text-xs font-medium transition-colors hover:border-ds-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
            invalid ? 'border-destructive' : 'border-ds-border',
            selected.length === 0 ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          <Tag className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{labelText}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-64 border-ds-border bg-ds-surface p-2 shadow-xl"
      >
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {labels.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              No labels yet
            </p>
          ) : (
            labels.map((label) => {
              const checked = value.includes(label.id);
              return (
                <label
                  key={label.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) onChange([...value, label.id]);
                      else onChange(value.filter((id) => id !== label.id));
                    }}
                    className="size-3.5 rounded border-ds-border"
                  />
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: label.color }}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{label.name}</span>
                </label>
              );
            })
          )}
        </div>
        {value.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-2 w-full rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Clear
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function CreateIssueDialog({
  open,
  onOpenChange,
  slug,
  defaultStatus,
}: CreateIssueDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <CreateIssueDialogContent
          key={open ? 'open' : 'closed'}
          slug={slug}
          defaultStatus={defaultStatus}
          onOpenChange={onOpenChange}
        />
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CreateIssueDialogContent({
  slug,
  defaultStatus,
  onOpenChange,
}: {
  slug: string;
  defaultStatus?: IssueStatus;
  onOpenChange: (open: boolean) => void;
}) {
  const { showToast } = useToast();
  const { data: membersData } = useMembers(slug);
  const { data: projectsData } = useProjects(slug);
  const { data: cyclesData } = useCycles(slug);
  const [cycleId, setCycleId] = useState<string | null>(null);

  const hasMembers = membersData ? membersData.members.length > 0 : true;
  const hasProjects = projectsData ? projectsData.projects.length > 0 : true;
  const hasCycles = cyclesData ? cyclesData.cycles.length > 0 : true;

  const form = useForm<CreateIssueRequest>({
    resolver: zodResolver(createIssueSchema),
    mode: 'all',
    defaultValues: {
      title: '',
      description: '',
      status: defaultStatus ?? 'BACKLOG',
      priority: 'NO_PRIORITY',
      assigneeId: null,
      projectId: null,
      labelIds: [],
      dueDate: null,
    },
  });

  const values = useWatch({ control: form.control });
  const titleValue = useWatch({ control: form.control, name: 'title' });
  const descriptionValue = useWatch({
    control: form.control,
    name: 'description',
  });
  const canSubmit = createIssueSchema.safeParse(values).success;
  const showErrors = form.formState.isSubmitted;
  const firstError = showErrors
    ? (form.formState.errors.title?.message ??
      form.formState.errors.description?.message ??
      form.formState.errors.dueDate?.message)
    : undefined;

  const updateIssue = useUpdateIssue(slug);
  const createMutation = useCreateIssue(slug, {
    onSuccess: async (issue) => {
      if (cycleId) {
        try {
          await updateIssue.mutateAsync({
            issueId: issue.id,
            body: { cycleId },
          });
        } catch {
          // creation succeeded, cycle attach failed — still show success but flag
          showToast({
            status: 'success',
            title: `Created ${issue.identifier}`,
            description: `"${issue.title}" — cycle not attached`,
          });
          form.reset();
          setCycleId(null);
          onOpenChange(false);
          return;
        }
      }
      showToast({
        status: 'success',
        title: `Created ${issue.identifier}`,
        description: `"${issue.title}" is ready`,
      });
      form.reset();
      setCycleId(null);
      onOpenChange(false);
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to create issue',
        description: error.message || 'Please try again.',
      });
    },
  });

  const busy = createMutation.isPending || updateIssue.isPending;

  // Keep dialog overflow-visible while any Select panel is open (motion/select is rendered inside the dialog,
  // not portaled). Popovers are portaled so they don't need this, but we route all panels through the same
  // flag for simplicity. Mirrors the statusPanelVisible pattern in CreateProjectDialog.
  const [panelVisible, setPanelVisible] = useState(false);
  const panelCloseTimer = useRef<number | null>(null);
  const openCountRef = useRef(0);
  useEffect(
    () => () => {
      if (panelCloseTimer.current !== null)
        window.clearTimeout(panelCloseTimer.current);
    },
    [],
  );
  const handlePanelOpenChange = (next: boolean) => {
    if (panelCloseTimer.current !== null) {
      window.clearTimeout(panelCloseTimer.current);
      panelCloseTimer.current = null;
    }
    if (next) {
      openCountRef.current += 1;
      setPanelVisible(true);
    } else {
      openCountRef.current = Math.max(0, openCountRef.current - 1);
      if (openCountRef.current === 0) {
        panelCloseTimer.current = window.setTimeout(() => {
          panelCloseTimer.current = null;
          setPanelVisible(false);
        }, 450);
      }
    }
  };

  const onSubmit = form.handleSubmit((vals) => {
    const payload: CreateIssueRequest = {
      title: vals.title,
      description: vals.description || undefined,
      status: vals.status,
      priority: vals.priority,
      assigneeId: vals.assigneeId ?? null,
      projectId: vals.projectId ?? null,
      labelIds: vals.labelIds ?? [],
      dueDate: vals.dueDate ?? null,
    };
    createMutation.mutate(payload);
  });

  return (
    <>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#17171714] backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[720px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-ds-border bg-ds-surface shadow-[0_12px_28px_#17171718]',
          panelVisible ? 'overflow-visible' : 'overflow-y-auto',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        )}
      >
        <div className="flex w-full items-center gap-3 px-8 pt-6">
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-xs"
          >
            <span className="font-medium text-muted-foreground">Issues</span>
            <ChevronRight
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="truncate font-semibold text-foreground">
              New issue
            </span>
          </nav>
          <DialogPrimitive.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </DialogPrimitive.Close>
        </div>

        <form noValidate onSubmit={onSubmit} className="flex flex-col">
          <div className="w-full px-8 pt-5">
            <label htmlFor="create-issue-title" className="sr-only">
              Issue title
            </label>
            <input
              id="create-issue-title"
              autoFocus
              value={titleValue ?? ''}
              onChange={(e) =>
                form.setValue('title', e.target.value, {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              onBlur={() => form.trigger('title')}
              placeholder="Issue title"
              disabled={busy}
              className="w-full bg-transparent text-xl font-bold tracking-[-0.4px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          <div className="w-full px-8 pt-2">
            <label htmlFor="create-issue-description" className="sr-only">
              Description
            </label>
            <textarea
              id="create-issue-description"
              value={descriptionValue ?? ''}
              onChange={(e) => form.setValue('description', e.target.value)}
              onBlur={() => form.trigger('description')}
              placeholder="Add description…"
              rows={3}
              disabled={busy}
              className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 px-8 pb-3 pt-4">
            <Select
              value={values.status ?? 'BACKLOG'}
              onValueChange={(v) =>
                form.setValue('status', v as IssueStatus, {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              onOpenChange={handlePanelOpenChange}
              disabled={busy}
            >
              <SelectTrigger className="inline-flex rounded-full! h-7 w-auto shrink-0 gap-1.5 border bg-ds-surface-subtle px-3 py-0 text-xs font-medium text-foreground [&>span:last-child]:hidden border-ds-border">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn(
                      'size-2 rounded-full',
                      STATUS_OPTIONS.find(
                        (o) => o.value === (values.status ?? 'BACKLOG'),
                      )?.dot,
                    )}
                  />
                  {
                    STATUS_OPTIONS.find(
                      (o) => o.value === (values.status ?? 'BACKLOG'),
                    )?.label
                  }
                </span>
              </SelectTrigger>
              <SelectContent className="w-max min-w-full">
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <span className="flex items-center gap-2 whitespace-nowrap">
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

            <Select
              value={values.priority ?? 'NO_PRIORITY'}
              onValueChange={(v) =>
                form.setValue('priority', v as IssuePriority, {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              onOpenChange={handlePanelOpenChange}
              disabled={busy}
            >
              <SelectTrigger className="inline-flex rounded-full! h-7 w-auto shrink-0 gap-1.5 border bg-ds-surface-subtle px-3 py-0 text-xs font-medium text-foreground [&>span:last-child]:hidden border-ds-border">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn(
                      'size-2 rounded-full',
                      PRIORITY_OPTIONS.find(
                        (o) => o.value === (values.priority ?? 'NO_PRIORITY'),
                      )?.dot,
                    )}
                  />
                  {
                    PRIORITY_OPTIONS.find(
                      (o) => o.value === (values.priority ?? 'NO_PRIORITY'),
                    )?.label
                  }
                </span>
              </SelectTrigger>
              <SelectContent className="w-max min-w-full">
                {PRIORITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <span className="flex items-center gap-2 whitespace-nowrap">
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

            <Select
              value={values.assigneeId ?? 'UNASSIGNED'}
              onValueChange={(v) =>
                form.setValue('assigneeId', v === 'UNASSIGNED' ? null : v, {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              onOpenChange={handlePanelOpenChange}
              disabled={busy || !hasMembers}
            >
              <SelectTrigger className="inline-flex rounded-full! h-7 w-auto max-w-[160px] shrink-0 gap-1.5 border bg-ds-surface-subtle px-3 py-0 text-xs font-medium text-foreground [&>span:last-child]:hidden border-ds-border">
                {(() => {
                  const selected = values.assigneeId
                    ? membersData?.members.find(
                        (m) => m.userId === values.assigneeId,
                      )
                    : undefined;
                  if (selected) {
                    return (
                      <span className="flex items-center gap-1.5 truncate">
                        {selected.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selected.image}
                            alt={selected.name}
                            className="size-4 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-ds-brand font-mono text-[7px] font-bold text-white">
                            {initialsOf(selected.name)}
                          </span>
                        )}
                        <span className="truncate">{selected.name}</span>
                      </span>
                    );
                  }
                  return (
                    <span className="flex items-center gap-1.5 truncate">
                      <User className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">Unassigned</span>
                    </span>
                  );
                })()}
              </SelectTrigger>
              <SelectContent className="w-max min-w-full">
                <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                {(membersData?.members ?? []).map((m) => (
                  <SelectItem
                    key={m.userId}
                    value={m.userId}
                    className="whitespace-nowrap"
                  >
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

            <Select
              value={values.projectId ?? 'NO_PROJECT'}
              onValueChange={(v) =>
                form.setValue('projectId', v === 'NO_PROJECT' ? null : v, {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              onOpenChange={handlePanelOpenChange}
              disabled={busy || !hasProjects}
            >
              <SelectTrigger className="inline-flex rounded-full! h-7 w-auto max-w-[160px] shrink-0 gap-1.5 border bg-ds-surface-subtle px-3 py-0 text-xs font-medium text-foreground [&>span:last-child]:hidden border-ds-border">
                <span className="flex items-center gap-1.5 truncate">
                  <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {values.projectId
                      ? (projectsData?.projects.find(
                          (p) => p.id === values.projectId,
                        )?.name ?? 'Project')
                      : 'No project'}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent className="w-max min-w-full">
                <SelectItem value="NO_PROJECT">No project</SelectItem>
                {(projectsData?.projects ?? []).map((p) => (
                  <SelectItem
                    key={p.id}
                    value={p.id}
                    className="whitespace-nowrap"
                  >
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 px-8 pb-6">
            <LabelsPill
              value={(values.labelIds as string[]) ?? []}
              onChange={(next) =>
                form.setValue('labelIds', next, {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              slug={slug}
              disabled={busy}
            />
            <DatePill
              value={values.dueDate as string | null | undefined}
              onChange={(v) =>
                form.setValue('dueDate', (v as string) ?? null, {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              placeholder="Due date"
              disabled={busy}
            />
            <Select
              value={cycleId ?? 'NO_CYCLE'}
              onValueChange={(v) => setCycleId(v === 'NO_CYCLE' ? null : v)}
              onOpenChange={handlePanelOpenChange}
              disabled={busy || !hasCycles}
            >
              <SelectTrigger className="inline-flex rounded-full! h-7 w-auto max-w-[180px] shrink-0 gap-1.5 border bg-ds-surface-subtle px-3 py-0 text-xs font-medium text-foreground [&>span:last-child]:hidden border-ds-border">
                <span className="flex items-center gap-1.5 truncate">
                  <RefreshCcw className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {cycleId
                      ? (cyclesData?.cycles.find((c) => c.id === cycleId)
                          ?.name ?? 'Cycle')
                      : 'No cycle'}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent className="w-max min-w-full">
                <SelectItem value="NO_CYCLE">No cycle</SelectItem>
                {(cyclesData?.cycles ?? []).map((cycle) => (
                  <SelectItem
                    key={cycle.id}
                    value={cycle.id}
                    className="whitespace-nowrap"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          cycle.status === 'ACTIVE'
                            ? 'bg-ds-brand'
                            : cycle.status === 'COMPLETED'
                              ? 'bg-ds-success'
                              : 'bg-ds-info',
                        )}
                      />
                      {cycle.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {firstError ? (
            <p role="alert" className="px-8 pb-3 text-xs text-destructive">
              {firstError}
            </p>
          ) : null}

          <div className="border-t border-ds-border" aria-hidden />

          <div className="flex w-full flex-wrap items-center justify-between gap-3 px-8 py-5">
            <p className="text-[11px] text-muted-foreground">
              Title required • SHIP-### auto
            </p>
            <StatefulButton
              type="submit"
              className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90 disabled:opacity-50"
              state={busy ? 'loading' : 'idle'}
              loadingText="Creating…"
              successText="Created"
              icon={<Plus className="size-4" />}
              disabled={!canSubmit || busy}
            >
              Create issue
            </StatefulButton>
          </div>
        </form>
      </DialogPrimitive.Content>
    </>
  );
}
