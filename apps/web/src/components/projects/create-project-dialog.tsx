'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, ChevronRight, Plus, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { ReactNode } from 'react';

import {
  createProjectSchema,
  type CreateProjectRequest,
  type ProjectStatus,
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
import { useCreateProject } from '@/hooks/use-projects';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

export interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  /**
   * Status the new project is created in (e.g. the board column the + was
   * clicked in). Preselects the status pill — omitted → PLANNED per design.
   */
  defaultStatus?: ProjectStatus;
}

// Form-only contract: start/target dates are required in this dialog, but the
// shared createProjectSchema keeps them optional (used by other callers).
// Refine locally so the shared schema is never mutated.
const createProjectFormSchema = createProjectSchema
  .refine((value) => !!value.startDate, {
    path: ['startDate'],
    message: 'Start date is required',
  })
  .refine((value) => !!value.targetDate, {
    path: ['targetDate'],
    message: 'Target date is required',
  });

const STATUS_OPTIONS: { value: ProjectStatus; label: string; dot: string }[] = [
  { value: 'PLANNED', label: 'Planned', dot: 'bg-ds-info' },
  { value: 'ACTIVE', label: 'Active', dot: 'bg-ds-brand' },
  { value: 'COMPLETED', label: 'Completed', dot: 'bg-ds-success' },
];

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** Pill shell shared by the status/date/owner controls in the pill bar. */
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
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-ds-surface-subtle px-3 text-xs font-medium text-foreground',
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
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder: string;
  invalid?: boolean;
  disabled?: boolean;
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
          disabled={disabled}
          aria-label={placeholder}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-ds-surface-subtle px-3 text-xs font-medium transition-colors hover:border-ds-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
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
          onSelect={(date) => {
            onChange(date ? toYmd(date) : undefined);
            setOpen(false);
          }}
          fixedWeeks
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Create Project Dialog — composer style per "Create Project Dialog" (r4MuhV)
 * in shipyard.pen: breadcrumb top bar, borderless name + description inputs,
 * pill bar (status select · start/target date calendars · disabled owner pill
 * for the current user), footer hint + Create action. Validates against the
 * shared createProjectSchema (name + required dates) and creates via
 * useCreateProject with success/error toasts.
 */
export function CreateProjectDialog({
  open,
  onOpenChange,
  slug,
  defaultStatus,
}: CreateProjectDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <CreateProjectDialogContent
          key={open ? 'open' : 'closed'}
          slug={slug}
          defaultStatus={defaultStatus}
          onOpenChange={onOpenChange}
        />
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CreateProjectDialogContent({
  slug,
  defaultStatus,
  onOpenChange,
}: {
  slug: string;
  defaultStatus?: ProjectStatus;
  onOpenChange: (open: boolean) => void;
}) {
  const { showToast } = useToast();
  const { data: session } = useSession();

  const form = useForm<CreateProjectRequest>({
    resolver: zodResolver(createProjectFormSchema),
    mode: 'all',
    defaultValues: {
      name: '',
      description: '',
      status: defaultStatus ?? 'PLANNED',
      startDate: undefined,
      targetDate: undefined,
    },
  });

  const values = useWatch({ control: form.control });
  const nameValue = useWatch({ control: form.control, name: 'name' });
  const descriptionValue = useWatch({
    control: form.control,
    name: 'description',
  });
  const canSubmit = createProjectFormSchema.safeParse(values).success;
  const showErrors = form.formState.isSubmitted;
  const firstError = showErrors
    ? (form.formState.errors.name?.message ??
      form.formState.errors.startDate?.message ??
      form.formState.errors.targetDate?.message ??
      form.formState.errors.description?.message)
    : undefined;

  const createMutation = useCreateProject(slug, {
    onSuccess: (project) => {
      showToast({
        status: 'success',
        title: 'Project created',
        description: `${project.name} is ready.`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to create project',
        description: error.message || 'Please try again.',
      });
    },
  });

  const busy = createMutation.isPending;
  const ownerName = session?.user.name?.trim() || 'You';
  // While the status panel is open (or still playing its ~0.4s close
  // animation) the dialog content switches to overflow-visible so the
  // absolutely-positioned panel floats above the dialog edge (like the
  // portaled calendar popovers) instead of getting clipped and forcing a
  // scrollbar. The flag lingers 450ms after close — flipping overflow back
  // immediately would clip the still-shrinking panel and flash a scrollbar
  // for a frame. The Select itself stays uncontrolled so the panel opens
  // and closes instantly; only the overflow flag is delayed.
  const [statusPanelVisible, setStatusPanelVisible] = useState(false);
  const statusCloseTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (statusCloseTimer.current !== null)
        window.clearTimeout(statusCloseTimer.current);
    },
    [],
  );
  const handleStatusOpenChange = (next: boolean) => {
    if (statusCloseTimer.current !== null) {
      window.clearTimeout(statusCloseTimer.current);
      statusCloseTimer.current = null;
    }
    if (next) {
      setStatusPanelVisible(true);
    } else {
      statusCloseTimer.current = window.setTimeout(() => {
        statusCloseTimer.current = null;
        setStatusPanelVisible(false);
      }, 450);
    }
  };

  const onSubmit = form.handleSubmit((vals) => {
    createMutation.mutate(vals);
  });

  return (
    <>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#17171714] backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[720px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-ds-border bg-ds-surface shadow-[0_12px_28px_#17171718]',
          statusPanelVisible ? 'overflow-visible' : 'overflow-y-auto',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        )}
      >
        {/* Top bar — breadcrumb + close */}
        <div className="flex w-full items-center gap-3 px-8 pt-6">
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-xs"
          >
            <span className="font-medium text-muted-foreground">Projects</span>
            <ChevronRight
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="truncate font-semibold text-foreground">
              New project
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
          {/* Borderless name input */}
          <div className="w-full px-8 pt-5">
            <label htmlFor="create-project-name" className="sr-only">
              Project name
            </label>
            <input
              id="create-project-name"
              autoFocus
              value={nameValue ?? ''}
              onChange={(e) =>
                form.setValue('name', e.target.value, {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              onBlur={() => form.trigger('name')}
              placeholder="Project name"
              disabled={busy}
              className="w-full bg-transparent text-xl font-bold tracking-[-0.4px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          {/* Borderless description */}
          <div className="w-full px-8 pt-2">
            <label htmlFor="create-project-description" className="sr-only">
              Description
            </label>
            <textarea
              id="create-project-description"
              value={descriptionValue ?? ''}
              onChange={(e) => form.setValue('description', e.target.value)}
              onBlur={() => form.trigger('description')}
              placeholder="Add description…"
              rows={3}
              disabled={busy}
              className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          {/* Pill bar — status select · dates · owner */}
          <div className="flex w-full flex-wrap items-center gap-2 px-8 pb-6 pt-4">
            <StatusPill
              value={values.status ?? 'PLANNED'}
              onChange={(next) =>
                form.setValue('status', next, {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              onOpenChange={handleStatusOpenChange}
              invalid={showErrors && !!form.formState.errors.status}
              disabled={busy}
            />
            <DatePill
              value={values.startDate}
              onChange={(v) =>
                form.setValue('startDate', v, {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              placeholder="Start date"
              invalid={showErrors && !!form.formState.errors.startDate}
              disabled={busy}
            />
            <DatePill
              value={values.targetDate}
              onChange={(v) =>
                form.setValue('targetDate', v, {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              placeholder="Target date"
              invalid={showErrors && !!form.formState.errors.targetDate}
              disabled={busy}
            />
            <Pill
              className="cursor-default aria-disabled:opacity-100"
              invalid={false}
            >
              <span aria-disabled className="flex items-center gap-1.5">
                {session?.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.image}
                    alt=""
                    className="size-4 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid size-4 place-items-center rounded-full bg-ds-brand font-mono text-[7px] font-bold text-white">
                    {initialsOf(ownerName)}
                  </span>
                )}
                <span className="max-w-28 truncate">{ownerName}</span>
              </span>
            </Pill>
          </div>

          {firstError ? (
            <p role="alert" className="px-8 pb-3 text-xs text-destructive">
              {firstError}
            </p>
          ) : null}

          <div className="border-t border-ds-border" aria-hidden />

          {/* Footer — hint + create */}
          <div className="flex w-full flex-wrap items-center justify-between gap-3 px-8 py-5">
            <p className="text-[11px] text-muted-foreground">
              Name required unique • You become owner
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
              Create project
            </StatefulButton>
          </div>
        </form>
      </DialogPrimitive.Content>
    </>
  );
}

function StatusPill({
  value,
  onChange,
  onOpenChange,
  invalid,
  disabled,
}: {
  value: ProjectStatus;
  onChange: (next: ProjectStatus) => void;
  onOpenChange: (open: boolean) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const option =
    STATUS_OPTIONS.find((o) => o.value === value) ?? STATUS_OPTIONS[0]!;
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as ProjectStatus)}
      onOpenChange={onOpenChange}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(
          // `rounded-full!` (important) pins the pill shape: the trigger
          // animates border-radius inline (gooey open/close), which would
          // otherwise override the class and leave the pill squarer than
          // the date/owner pills. inline-flex + shrink-0 mirror the date
          // pills exactly so all pills share the same box.
          'inline-flex rounded-full! h-8 w-auto shrink-0 gap-1.5 border bg-ds-surface-subtle px-3 py-0 text-xs font-medium text-foreground [&>span:last-child]:hidden',
          invalid ? 'border-destructive' : 'border-ds-border',
        )}
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2 rounded-full', option.dot)} />
          {option.label}
        </span>
      </SelectTrigger>
      {/* Panel sizes to its content (w-max, at least trigger width) so
          option labels like Completed are never cut by the narrow pill. */}
      <SelectContent className="w-max min-w-full">
        {STATUS_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span
                aria-hidden
                className={cn('size-2 rounded-full', option.dot)}
              />
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
