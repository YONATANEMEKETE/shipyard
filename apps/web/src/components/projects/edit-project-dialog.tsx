'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Folder, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import {
  projectDateSchema,
  projectNameSchema,
  projectStatusSchema,
  type ProjectDetail,
  type ProjectStatus,
} from '@shipyard/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/motion/select';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { StatefulButton } from '@/components/motion/button/stateful';
import { useUpdateProject } from '@/hooks/use-projects';
import { useToast } from '@/components/providers/toast-provider';
import { DatePickerField } from '@/components/projects/date-picker-field';
import { cn } from '@/lib/utils';

export interface EditProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  /** The project being edited — drives the form's initial values. */
  project: ProjectDetail | null;
}

// Form contract — name + status are required in the dialog; dates and
// description are optional and clearable (explicit null on update). Mirrors
// Element / Edit Project Modal in shipyard.pen.
const editProjectFormSchema = z.object({
  name: projectNameSchema,
  description: z
    .string()
    .max(10000, 'Description must be 10,000 characters or less')
    .optional(),
  status: projectStatusSchema,
  startDate: projectDateSchema.optional(),
  targetDate: projectDateSchema.optional(),
});

type EditProjectFormValues = z.infer<typeof editProjectFormSchema>;

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'PLANNED', label: 'Planned' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
];

const STATUS_DOT: Record<ProjectStatus, string> = {
  ACTIVE: 'bg-ds-brand',
  COMPLETED: 'bg-ds-success',
  PLANNED: 'bg-ds-text-muted',
};

/**
 * Edit Project Dialog — mirrors Element / Edit Project Modal (Sgz99) in
 * shipyard.pen: 500w modal, header (17/700 title + 12 muted subcopy + X),
 * Project name input, Description textarea, Status select (dot + label +
 * chevron), Start/Target date row, footer Cancel (Ghost/X) + Save changes
 * (Primary/Check). Saves via useUpdateProject; success/error toasts (same
 * pattern as create-project-dialog).
 */
export function EditProjectDialog({
  open,
  onOpenChange,
  slug,
  project,
}: EditProjectDialogProps) {
  const { showToast } = useToast();

  const form = useForm<EditProjectFormValues>({
    resolver: zodResolver(editProjectFormSchema),
    mode: 'all',
    defaultValues: {
      name: project?.name ?? '',
      description: project?.description ?? '',
      status: project?.status ?? 'ACTIVE',
      startDate: project?.startDate ?? undefined,
      targetDate: project?.targetDate ?? undefined,
    },
  });

  const values = useWatch({ control: form.control });
  const canSubmit = editProjectFormSchema.safeParse(values).success;

  const updateMutation = useUpdateProject(slug, {
    onSuccess: (updated) => {
      showToast({
        status: 'success',
        title: 'Project updated',
        description: `${updated.name} is saved.`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to update project',
        description: error.message || 'Please try again.',
      });
    },
  });

  // Hydrate the form from the selected project every time the dialog opens
  // (and whenever the project object changes while open).
  useEffect(() => {
    if (!open) return;
    form.reset({
      name: project?.name ?? '',
      description: project?.description ?? '',
      status: project?.status ?? 'ACTIVE',
      startDate: project?.startDate ?? undefined,
      targetDate: project?.targetDate ?? undefined,
    });
  }, [open, project, form]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => form.setFocus('name'), 50);
    return () => clearTimeout(t);
  }, [open, form]);

  if (!project) return null;

  const onSubmit = form.handleSubmit((vals) => {
    updateMutation.mutate({
      projectId: project.id,
      body: {
        name: vals.name,
        description: vals.description ?? null,
        status: vals.status,
        startDate: vals.startDate ?? null,
        targetDate: vals.targetDate ?? null,
      },
    });
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
                Edit project
              </DialogPrimitive.Title>
              <p className="text-[12px] leading-[1.55] text-muted-foreground">
                Update the project&apos;s details or change its operational
                status.
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
                        disabled={updateMutation.isPending}
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
                      <textarea
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        onBlur={field.onBlur}
                        placeholder="A short summary of what this project is working toward…"
                        rows={2}
                        disabled={updateMutation.isPending}
                        className={cn(
                          'min-h-[64px] w-full resize-none rounded-md border bg-ds-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          fieldState.error
                            ? 'border-destructive'
                            : 'border-ds-border',
                        )}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="gap-1.5">
                    <FormLabel className="text-[11px] font-semibold text-foreground">
                      Status
                    </FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={(value) =>
                          field.onChange(value as ProjectStatus)
                        }
                      >
                        <SelectTrigger className="h-9 rounded-md border-ds-border bg-ds-surface text-sm">
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className={cn(
                                'size-[7px] shrink-0 rounded-full',
                                STATUS_DOT[field.value],
                              )}
                            />
                            <SelectValue placeholder="Select status" />
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                    disabled={updateMutation.isPending}
                    className="h-9 gap-1.5"
                  >
                    <X className="size-3.5" />
                    Cancel
                  </Button>
                </DialogPrimitive.Close>
                <StatefulButton
                  type="submit"
                  className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90 disabled:opacity-50"
                  state={updateMutation.isPending ? 'loading' : 'idle'}
                  loadingText="Saving…"
                  successText="Saved"
                  icon={<Check className="size-4" />}
                  disabled={!canSubmit || updateMutation.isPending}
                >
                  Save changes
                </StatefulButton>
              </div>
            </form>
          </Form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
