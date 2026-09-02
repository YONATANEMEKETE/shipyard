'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Folder, Plus, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import {
  createProjectSchema,
  type CreateProjectRequest,
} from '@shipyard/shared';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { StatefulButton } from '@/components/motion/button/stateful';
import { useCreateProject } from '@/hooks/use-projects';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

export interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
}

// Form-only contract: start/target dates are required in this dialog, but the
// shared createProjectSchema keeps them optional (used by other callers).
// Refine locally so the shared schema is never mutated. The refine keeps the
// same zod shape (dates stay optional in the type) so react-hook-form generics
// stay aligned.
const createProjectFormSchema = createProjectSchema
  .refine((value) => !!value.startDate, {
    path: ['startDate'],
    message: 'Start date is required',
  })
  .refine((value) => !!value.targetDate, {
    path: ['targetDate'],
    message: 'Target date is required',
  });

/**
 * Create Project Dialog — matches Element / Create Project Modal in shipyard.pen
 * (Hprkb → Create Project Dialog oSCPQ): 500w, rounded-16, p-6, gap-20,
 * header 17/700/-0.4 + 12 muted, X 32, name + description + date row,
 * footer Cancel (Ghost/X) + Create (Primary/Plus).
 * Validates against the shared createProjectSchema (zod) with start/target date
 * required in the form, then creates the project via useCreateProject and
 * shows success/error toasts (mirrors create-workspace-dialog).
 */
export function CreateProjectDialog({
  open,
  onOpenChange,
  slug,
}: CreateProjectDialogProps) {
  const { showToast } = useToast();

  const form = useForm<CreateProjectRequest>({
    resolver: zodResolver(createProjectFormSchema),
    mode: 'all',
    defaultValues: {
      name: '',
      description: '',
      startDate: undefined,
      targetDate: undefined,
    },
  });

  const values = useWatch({ control: form.control });
  const canSubmit = createProjectFormSchema.safeParse(values).success;

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

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => form.setFocus('name'), 50);
    return () => clearTimeout(t);
  }, [open, form]);

  useEffect(() => {
    if (!open)
      form.reset({
        name: '',
        description: '',
        startDate: undefined,
        targetDate: undefined,
      });
  }, [open, form]);

  const onSubmit = form.handleSubmit((vals) => {
    createMutation.mutate(vals);
  });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#17171714] backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[500px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-2xl border border-ds-border bg-ds-surface p-6 shadow-[0_12px_28px_#17171718]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          {/* Header */}
          <div className="flex w-full items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <DialogPrimitive.Title className="text-[17px] font-bold leading-none tracking-[-0.4px] text-foreground">
                Create new project
              </DialogPrimitive.Title>
              <p className="text-[12px] leading-[1.55] text-muted-foreground">
                Name it and set an optional target. You&apos;ll be the project
                owner.
              </p>
            </div>
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

          <Form {...form}>
            <form
              noValidate
              onSubmit={onSubmit}
              className="flex flex-col gap-5"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field, fieldState }) => (
                  <FormItem className="gap-1.5">
                    <FormLabel className="text-[11px] font-semibold text-foreground">
                      Project name
                    </FormLabel>
                    <FormControl>
                      <Input
                        value={field.value ?? ''}
                        onChange={(value) =>
                          field.onChange(value, {
                            shouldValidate: form.formState.isSubmitted,
                          })
                        }
                        onBlur={() => {
                          field.onBlur();
                          form.trigger('name');
                        }}
                        placeholder="Ship Payroll"
                        leftIcon={<Folder className="size-4" />}
                        disabled={createMutation.isPending}
                        error={fieldState.error?.message}
                        classNames={{
                          field:
                            'h-9 rounded-md border-ds-border bg-ds-surface',
                          input: 'text-sm',
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field, fieldState }) => (
                  <FormItem className="gap-1.5">
                    <FormLabel className="text-[11px] font-semibold text-foreground">
                      Description
                    </FormLabel>
                    <FormControl>
                      <div className="flex flex-col">
                        <textarea
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value)}
                          onBlur={field.onBlur}
                          placeholder="A short summary of what this project is working toward…"
                          rows={3}
                          disabled={createMutation.isPending}
                          className={cn(
                            'min-h-[76px] w-full resize-none rounded-md border bg-ds-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            fieldState.error
                              ? 'border-destructive'
                              : 'border-ds-border',
                          )}
                        />
                        {fieldState.error?.message ? (
                          <p className="mt-1.5 text-xs text-destructive">
                            {fieldState.error.message}
                          </p>
                        ) : null}
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex w-full gap-3">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field, fieldState }) => (
                    <FormItem className="flex-1 gap-1.5">
                      <FormLabel className="text-[11px] font-semibold text-foreground">
                        Start date
                      </FormLabel>
                      <FormControl>
                        <DatePickerField
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Pick a date"
                          error={fieldState.error?.message}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="targetDate"
                  render={({ field, fieldState }) => (
                    <FormItem className="flex-1 gap-1.5">
                      <FormLabel className="text-[11px] font-semibold text-foreground">
                        Target date
                      </FormLabel>
                      <FormControl>
                        <DatePickerField
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Pick a date"
                          error={fieldState.error?.message}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex w-full items-center justify-end gap-2.5 pt-1">
                <DialogPrimitive.Close asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={createMutation.isPending}
                    className="h-9 gap-1.5"
                  >
                    <X className="size-3.5" />
                    Cancel
                  </Button>
                </DialogPrimitive.Close>
                <StatefulButton
                  type="submit"
                  className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90 disabled:opacity-50"
                  state={createMutation.isPending ? 'loading' : 'idle'}
                  loadingText="Creating…"
                  successText="Created"
                  icon={<Plus className="size-4" />}
                  disabled={!canSubmit || createMutation.isPending}
                >
                  Create project
                </StatefulButton>
              </div>
            </form>
          </Form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Local date picker — react-day-picker `Calendar` shown in a `Popover`,
 * triggered by a calendar-icon button. Values are serialized to the
 * shared `YYYY-MM-DD` format expected by `createProjectSchema`.
 */
function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function DatePickerField({
  value,
  onChange,
  placeholder,
  error,
}: {
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected: Date | undefined = value
    ? new Date(`${value}T12:00:00`)
    : undefined;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-md border bg-ds-surface px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              error ? 'border-destructive' : 'border-ds-border',
              !value && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">
              {value
                ? format(new Date(`${value}T12:00:00`), 'MMM d, yyyy')
                : (placeholder ?? 'Pick a date')}
            </span>
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
          <div className="flex items-center justify-between border-t border-ds-border p-2">
            <span className="pl-2 text-xs text-muted-foreground">
              {value
                ? format(new Date(`${value}T12:00:00`), 'EEEE, MMMM d, yyyy')
                : 'No date selected'}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {error ? (
        <p className="mt-1.5 text-xs text-destructive">{error}</p>
      ) : null}
    </>
  );
}
