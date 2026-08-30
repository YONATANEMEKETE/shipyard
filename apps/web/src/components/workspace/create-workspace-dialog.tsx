'use client';

import { Dialog as DialogPrimitive } from 'radix-ui';
import { Container, X } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'next/navigation';
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
import { StatefulButton } from '@/components/motion/button/stateful';
import { IconSelect } from '@/components/workspace/icon-select';
import { useCreateWorkspace } from '@/hooks/use-workspaces';
import { setSelectedWorkspace } from '@/lib/workspace/selected-workspace';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

export interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: CreateWorkspaceDialogProps) {
  const router = useRouter();
  const { showToast } = useToast();

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
    onSuccess: (workspace) => {
      showToast({
        status: 'success',
        title: 'Workspace created',
        description: `${workspace.name} is ready.`,
      });
      setSelectedWorkspace(workspace.slug);
      onOpenChange(false);
      router.push(`/w/${workspace.slug}`);
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to create workspace',
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
    if (!open) form.reset({ name: '', icon: 'boxes' });
  }, [open, form]);

  const onSubmit = form.handleSubmit((vals) => {
    createMutation.mutate(vals);
  });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#16151259] backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[500px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-[22px] overflow-visible rounded-xl border border-ds-border-strong bg-ds-surface p-7 shadow-xl',
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
                  <FormItem className="relative z-20 gap-2">
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
                <StatefulButton
                  type="submit"
                  size="md"
                  className="h-9 gap-2 bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90"
                  state={createMutation.isPending ? 'loading' : 'idle'}
                  loadingText="Creating…"
                  successText="Created"
                  disabled={!canSubmit || createMutation.isPending}
                >
                  Create workspace
                </StatefulButton>
              </div>
            </form>
          </Form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
