'use client';

import { Dialog as DialogPrimitive } from 'radix-ui';
import { Container, Plus, X } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import {
  createWorkspaceSchema,
  type CreateWorkspaceRequest,
} from '@shipyard/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { IconSelect } from '@/components/workspace/icon-select';
import { useCreateWorkspace } from '@/hooks/use-workspaces';
import { cn } from '@/lib/utils';

export interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (slug: string) => void;
}

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateWorkspaceDialogProps) {
  const form = useForm<CreateWorkspaceRequest>({
    resolver: zodResolver(createWorkspaceSchema),
    mode: 'all',
    defaultValues: {
      name: '',
      icon: 'boxes',
    },
  });

  const values = useWatch({ control: form.control });
  const canSubmit = createWorkspaceSchema.safeParse(values).success;

  const createMutation = useCreateWorkspace({
    onSuccess: (data) => {
      form.reset({ name: '', icon: 'boxes' });
      onOpenChange(false);
      onCreated?.(data.slug);
    },
  });

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => form.setFocus('name'), 50);
    return () => clearTimeout(t);
  }, [open, form]);

  useEffect(() => {
    if (!open) {
      form.reset({ name: '', icon: 'boxes' });
      createMutation.reset();
    }
  }, [open, form, createMutation]);

  const onSubmit = form.handleSubmit((vals) => {
    createMutation.mutate(vals);
  });

  const apiError = createMutation.error?.message ?? null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#16151259] backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[500px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-[22px] overflow-auto rounded-xl border border-ds-border-strong bg-ds-surface p-7 shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          <div className="flex w-full items-start justify-between gap-4">
            <div className="flex flex-1 flex-col gap-[5px]">
              <DialogPrimitive.Title className="text-[20px] font-bold leading-none tracking-[-0.6px] text-foreground">
                Create a workspace.
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs leading-[1.5] text-muted-foreground">
                You become its Owner immediately — everything else ships later.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Close"
                className="size-9 shrink-0 rounded-md border-ds-border bg-ds-surface text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-[15px]" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <Form {...form}>
            <form
              onSubmit={onSubmit}
              noValidate
              className="flex flex-col gap-[22px]"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field, fieldState }) => (
                  <FormItem className="gap-2">
                    <FormLabel className="text-xs font-semibold text-foreground">
                      Workspace name
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
                        placeholder="Sable & Co"
                        leftIcon={<Container className="size-4" />}
                        error={fieldState.error?.message}
                        disabled={createMutation.isPending}
                        classNames={{
                          field: 'h-11 rounded-md border-border bg-card',
                          input: 'text-sm',
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem className="gap-2">
                    <FormLabel className="text-xs font-semibold text-foreground">
                      Icon
                    </FormLabel>
                    <FormControl>
                      <IconSelect
                        value={field.value}
                        onValueChange={(next) =>
                          field.onChange(next, {
                            shouldValidate: form.formState.isSubmitted,
                          })
                        }
                        disabled={createMutation.isPending}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {apiError ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive"
                >
                  {apiError}
                </p>
              ) : null}

              <div className="flex w-full items-center justify-end gap-2.5 pt-1">
                <DialogPrimitive.Close asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={createMutation.isPending}
                    className="h-9 gap-2 px-4 text-sm font-medium"
                  >
                    <X className="size-4" />
                    Cancel
                  </Button>
                </DialogPrimitive.Close>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!canSubmit || createMutation.isPending}
                  className="h-9 gap-2 px-4 text-sm font-semibold"
                >
                  {createMutation.isPending ? (
                    <span
                      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                      aria-hidden
                    />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {createMutation.isPending ? 'Creating…' : 'Create workspace'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
