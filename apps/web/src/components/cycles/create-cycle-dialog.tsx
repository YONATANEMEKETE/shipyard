'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, ChevronRight, Plus, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { createCycleSchema, type CreateCycleRequest } from '@shipyard/shared';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { StatefulButton } from '@/components/motion/button/stateful';
import { toYmd } from '@/components/projects/date-picker-field';
import { useCreateCycle } from '@/hooks/use-cycles';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

export interface CreateCycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
}

/**
 * Create Cycle Dialog — composer style per "Create Cycle Dialog" (gZWJ7) in
 * shipyard.pen: breadcrumb top bar, borderless name + goal inputs, pill bar
 * (start/end date calendars), footer hint + Create action.
 *
 * No status pill: creation always lands PLANNED (spec §3.2), so the only
 * server-side rules the user needs to know are name uniqueness and the
 * non-overlap window — both stated in the footer hint. Validation reuses the
 * shared `createCycleSchema` (endDate >= startDate refine included), so the
 * dialog and the API agree on every rule before the request goes out.
 */
export function CreateCycleDialog({
  open,
  onOpenChange,
  slug,
}: CreateCycleDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <CreateCycleDialogContent
          key={open ? 'open' : 'closed'}
          slug={slug}
          onOpenChange={onOpenChange}
        />
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CreateCycleDialogContent({
  slug,
  onOpenChange,
}: {
  slug: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { showToast } = useToast();

  const form = useForm<CreateCycleRequest>({
    resolver: zodResolver(createCycleSchema),
    mode: 'all',
    defaultValues: { name: '', goal: '', startDate: '', endDate: '' },
  });

  const values = useWatch({ control: form.control });
  const nameValue = useWatch({ control: form.control, name: 'name' });
  const goalValue = useWatch({ control: form.control, name: 'goal' });
  const canSubmit = createCycleSchema.safeParse(values).success;
  const showErrors = form.formState.isSubmitted;
  const firstError = showErrors
    ? (form.formState.errors.name?.message ??
      form.formState.errors.goal?.message ??
      form.formState.errors.startDate?.message ??
      form.formState.errors.endDate?.message)
    : undefined;

  const createMutation = useCreateCycle(slug, {
    onSuccess: (cycle) => {
      showToast({
        status: 'success',
        title: 'Cycle created',
        description: `${cycle.name} is planned.`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to create cycle',
        description: error.message || 'Please try again.',
      });
    },
  });

  const busy = createMutation.isPending;

  const onSubmit = form.handleSubmit((vals) => {
    // An empty goal is "no goal", not an empty string — the API takes the
    // field as optional and the detail response renders null for absent.
    createMutation.mutate({
      name: vals.name,
      goal: vals.goal?.trim() ? vals.goal : undefined,
      startDate: vals.startDate,
      endDate: vals.endDate,
    });
  });

  return (
    <>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#17171714] backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[720px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-2xl border border-ds-border bg-ds-surface shadow-[0_12px_28px_#17171718]',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        )}
      >
        {/* Top bar — breadcrumb + close */}
        <div className="flex w-full items-center gap-3 px-8 pt-6">
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-xs"
          >
            <span className="font-medium text-muted-foreground">Cycles</span>
            <ChevronRight
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="truncate font-semibold text-foreground">
              New cycle
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
            <label htmlFor="create-cycle-name" className="sr-only">
              Cycle name
            </label>
            <input
              id="create-cycle-name"
              autoFocus
              value={nameValue ?? ''}
              onChange={(e) =>
                form.setValue('name', e.target.value, {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              onBlur={() => form.trigger('name')}
              placeholder="Cycle name"
              disabled={busy}
              className="w-full bg-transparent text-xl font-bold tracking-[-0.4px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          {/* Borderless goal */}
          <div className="w-full px-8 pt-2">
            <label htmlFor="create-cycle-goal" className="sr-only">
              Goal
            </label>
            <textarea
              id="create-cycle-goal"
              value={goalValue ?? ''}
              onChange={(e) => form.setValue('goal', e.target.value)}
              onBlur={() => form.trigger('goal')}
              placeholder="Add a goal…"
              rows={3}
              disabled={busy}
              className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          {/* Pill bar — start + end date calendars. No status pill: creation
              always lands PLANNED, and the range is the only other input. */}
          <div className="flex w-full flex-wrap items-center gap-2 px-8 pb-6 pt-4">
            <DatePill
              value={values.startDate}
              onChange={(v) =>
                form.setValue('startDate', v ?? '', {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              placeholder="Start date"
              invalid={showErrors && !!form.formState.errors.startDate}
              disabled={busy}
            />
            <DatePill
              value={values.endDate}
              onChange={(v) =>
                form.setValue('endDate', v ?? '', {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              placeholder="End date"
              invalid={showErrors && !!form.formState.errors.endDate}
              disabled={busy}
            />
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
              Name required unique • Dates must not overlap
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
              Create cycle
            </StatefulButton>
          </div>
        </form>
      </DialogPrimitive.Content>
    </>
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
