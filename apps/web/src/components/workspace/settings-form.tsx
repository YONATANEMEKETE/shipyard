'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Archive,
  ArchiveRestore,
  Check,
  Container,
  Copy,
  Info,
  Trash2,
  X,
  CheckCheck,
} from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { nameSchema, type WorkspaceIconKey } from '@shipyard/shared';

import { StatefulButton } from '@/components/motion/button/stateful';
import { Button } from '@/components/motion/button/base';
import { Loader } from '@/components/motion/loader';
import { useToast } from '@/components/providers/toast-provider';
import {
  useArchiveWorkspace,
  useDeleteWorkspace,
  useRestoreWorkspace,
  useWorkspace,
  useUpdateWorkspace,
} from '@/hooks/use-workspaces';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  clearSelectedWorkspace,
  getSelectedWorkspace,
} from '@/lib/workspace/selected-workspace';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IconSelect } from '@/components/workspace/icon-select';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { isArchived } from '@/lib/workspace/is-archived';
import { cn } from '@/lib/utils';

const settingsSchema = z.object({
  name: nameSchema,
  icon: z.string().min(1, 'Icon is required'),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export function SettingsForm({ slug }: { slug: string }) {
  const { data: workspace, isPending } = useWorkspace(slug);
  const defaultName = workspace?.name ?? 'Acme Studio';
  const defaultIcon = (workspace?.icon ?? 'boxes') as WorkspaceIconKey;

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    mode: 'all',
    values: workspace
      ? { name: workspace.name, icon: (workspace.icon ?? 'boxes') as string }
      : { name: defaultName, icon: defaultIcon },
  });

  const { showToast } = useToast();
  const router = useRouter();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [copied, setCopied] = useState(false);
  const values = useWatch({ control: form.control });
  const parsed = settingsSchema.safeParse(values);
  const canSave = parsed.success;

  const hasChanges = values.name !== defaultName || values.icon !== defaultIcon;

  const archived = isArchived(workspace);

  const archiveMutation = useArchiveWorkspace(slug, {
    onSuccess: () => {
      showToast({
        status: 'success',
        title: 'Workspace archived',
        description: 'It is now read-only.',
      });
      setArchiveOpen(false);
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to archive',
        description: error.message,
      });
    },
  });

  const deleteMutation = useDeleteWorkspace(slug, {
    onSuccess: () => {
      showToast({ status: 'success', title: 'Workspace deleted' });
      if (getSelectedWorkspace() === slug) clearSelectedWorkspace();
      router.replace('/w');
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to delete',
        description: error.message,
      });
    },
  });

  const restoreMutation = useRestoreWorkspace(slug, {
    onSuccess: () => {
      showToast({ status: 'success', title: 'Workspace restored' });
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to restore',
        description: error.message,
      });
    },
  });

  const updateMutation = useUpdateWorkspace(slug, {
    onSuccess: () => {
      showToast({
        status: 'success',
        title: 'Workspace updated',
        description: 'Changes saved.',
      });
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: 'Failed to update workspace',
        description: error.message || 'Please try again.',
      });
    },
  });

  if (isPending) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
        <Loader variant="spinner" size={24} label="Loading workspace" />
        <p className="text-sm text-muted-foreground">Loading settings…</p>
      </div>
    );
  }

  const onSubmit = form.handleSubmit((vals) => {
    const patch: { name?: string; icon?: WorkspaceIconKey } = {};
    if (vals.name !== defaultName) patch.name = vals.name;
    if (vals.icon !== defaultIcon) patch.icon = vals.icon as WorkspaceIconKey;
    if (Object.keys(patch).length === 0) return;
    updateMutation.mutate(patch);
  });

  return (
    <div className="flex w-full flex-col gap-6">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-ds-brand">
        Workspace Settings
      </span>

      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-bold leading-none tracking-[-1px] text-foreground">
          Manage {defaultName}.
        </h1>
        <p className="text-[13px] leading-[1.5] text-muted-foreground">
          Update how your workspace appears everywhere — its name and icon stay
          display-only.
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="gap-0.5 rounded-md border border-ds-border bg-ds-surface-subtle">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 flex flex-col gap-6">
          <section className="flex w-full flex-col gap-[18px] rounded-xl border border-ds-border bg-ds-bg p-6">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-muted-foreground">
              General / Identity
            </span>

            <Form {...form}>
              <form
                noValidate
                onSubmit={onSubmit}
                className="flex flex-col gap-[18px]"
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
                          disabled={archived}
                          onChange={(value) =>
                            field.onChange(value, {
                              shouldValidate: form.formState.isSubmitted,
                            })
                          }
                          onBlur={() => {
                            field.onBlur();
                            form.trigger('name');
                          }}
                          placeholder="Acme Studio"
                          leftIcon={<Container className="size-4" />}
                          error={fieldState.error?.message}
                          classNames={{
                            field:
                              'h-11 rounded-md border-ds-border bg-ds-surface',
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
                    <FormItem className="w-full gap-2 sm:w-1/2">
                      <FormLabel className="text-xs font-semibold text-foreground">
                        Icon
                      </FormLabel>
                      <FormControl>
                        <IconSelect
                          value={field.value as WorkspaceIconKey}
                          disabled={archived}
                          onValueChange={(next) =>
                            field.onChange(next, {
                              shouldValidate: form.formState.isSubmitted,
                            })
                          }
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex w-full items-center justify-between pt-1">
                  <StatefulButton
                    type="submit"
                    disabled={
                      archived ||
                      !canSave ||
                      !hasChanges ||
                      updateMutation.isPending
                    }
                    state={updateMutation.isPending ? 'loading' : 'idle'}
                    loadingText="Saving…"
                    icon={<Check className="h-4 w-4" />}
                    className="h-9 gap-2 bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90"
                  >
                    Save changes
                  </StatefulButton>
                </div>
              </form>
            </Form>
          </section>

          <section className="flex w-full flex-col gap-[18px] rounded-xl border border-ds-border bg-ds-bg p-6">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-ds-danger">
              Danger Zone · Owner Only
            </span>

            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-1 flex-col gap-[3px]">
                <p className="text-[13px] font-semibold leading-none text-foreground">
                  {archived
                    ? 'Restore this workspace'
                    : 'Archive this workspace'}
                </p>
                <p className="text-[11px] leading-[1.45] text-muted-foreground">
                  {archived
                    ? 'Make it active and editable again.'
                    : 'Becomes read-only for every member. Fully restorable, history preserved.'}
                </p>
              </div>
              {archived ? (
                <StatefulButton
                  type="button"
                  variant="outline"
                  state={restoreMutation.isPending ? 'loading' : 'idle'}
                  loadingText="Restoring…"
                  icon={<ArchiveRestore className="h-3.5 w-3.5" />}
                  onClick={() => restoreMutation.mutate()}
                  className="h-8 shrink-0 gap-1.5 rounded-md border-ds-border bg-ds-surface px-3 text-xs font-semibold text-foreground"
                >
                  Restore
                </StatefulButton>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setArchiveOpen(true)}
                  className="h-8 shrink-0 gap-1.5 rounded-md border-ds-danger bg-ds-danger-soft px-3 text-xs font-semibold text-ds-danger hover:bg-ds-danger-soft/80"
                >
                  <Archive className="h-3.5 w-3.5" />
                  Archive…
                </Button>
              )}
            </div>

            <div className="h-px w-full bg-ds-border" />

            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-1 flex-col gap-[3px]">
                <p className="flex-1 text-[13px] font-semibold text-foreground">
                  Permanently delete workspace
                </p>
                <p className="text-[11px] leading-[1.45] text-muted-foreground">
                  {archived
                    ? 'Type the workspace name to confirm. This cannot be undone.'
                    : 'Archive first — only archived workspaces can be deleted.'}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={!archived}
                onClick={() => {
                  setConfirmName('');
                  setDeleteOpen(true);
                }}
                className="h-8 shrink-0 gap-1.5 rounded-md border-ds-danger bg-ds-danger-soft px-3 text-xs font-semibold text-ds-danger hover:bg-ds-danger-soft/80 disabled:border-ds-border disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete…
              </Button>
            </div>
          </section>

          <p className="flex items-center gap-2 text-[11px] leading-none text-muted-foreground">
            <Info className="h-3 w-3 shrink-0" />
            Changes propagate instantly to the switcher, header and every
            member&apos;s sidebar.
          </p>
        </TabsContent>

        <TabsContent value="members" className="mt-6">
          <div className="rounded-lg border border-ds-border bg-ds-surface p-8 text-center">
            <p className="text-sm font-medium text-foreground">Members</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Member management ships later.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <DialogPrimitive.Root open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#16151259] backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className={cn(
              'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-ds-border-strong bg-ds-surface p-6 shadow-xl',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            )}
          >
            <div className="flex w-full items-start justify-between gap-4">
              <div className="flex flex-1 flex-col gap-1.5">
                <DialogPrimitive.Title className="text-base font-bold leading-none tracking-[-0.3px] text-foreground">
                  Archive workspace?
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-xs leading-[1.5] text-muted-foreground">
                  &quot;{defaultName}&quot; will become read-only for every
                  member. You can restore it anytime from settings or the
                  workspace picker.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Close"
                  className="size-8 shrink-0 rounded-md border-ds-border bg-ds-surface text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3.5" />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <div className="flex w-full items-center justify-end gap-2.5 pt-2">
              <DialogPrimitive.Close asChild>
                <Button variant="outline" onClick={() => setArchiveOpen(false)}>
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <StatefulButton
                type="button"
                state={archiveMutation.isPending ? 'loading' : 'idle'}
                loadingText="Archiving…"
                onClick={() => archiveMutation.mutate()}
                className="bg-ds-danger text-white hover:bg-ds-danger/90"
              >
                Archive workspace
              </StatefulButton>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) {
            setConfirmName('');
            setCopied(false);
          }
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#16151259] backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className={cn(
              'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[520px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-6 rounded-2xl border border-ds-border-strong bg-ds-surface p-[26px] shadow-xl',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            )}
          >
            <div className="flex w-full items-center gap-3.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-ds-border bg-ds-danger-soft">
                <Trash2 className="size-[22px] text-ds-danger" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <DialogPrimitive.Title className="text-[17px] font-bold leading-none tracking-[-0.4px] text-foreground">
                  Delete {defaultName}?
                </DialogPrimitive.Title>
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-ds-danger">
                  Irreversible · Owner only
                </span>
              </span>
              <DialogPrimitive.Close asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Close"
                  className="size-8 shrink-0 rounded-md border-ds-border bg-ds-surface text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3.5" />
                </Button>
              </DialogPrimitive.Close>
            </div>

            <p className="text-xs leading-[1.6] text-muted-foreground">
              This will permanently remove all projects, issues, cycles,
              memberships and invitations. Your Shipyard account stays untouched
              and this cannot be undone.
            </p>

            <div className="flex flex-col gap-2">
              <span className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-foreground">
                <span>Type</span>
                <span className="inline-flex items-center gap-2 rounded-md border border-ds-border bg-ds-bg px-2 py-1">
                  <code className="select-all font-mono text-[11px] font-semibold text-foreground">
                    {defaultName}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(defaultName);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1400);
                    }}
                    aria-label={copied ? 'Copied' : 'Copy workspace name'}
                    className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {copied ? (
                      <CheckCheck className="size-[13px] text-ds-success" />
                    ) : (
                      <Copy className="size-[13px]" />
                    )}
                  </button>
                </span>
                <span>to confirm</span>
              </span>
              <Input
                value={confirmName}
                onChange={(value) => setConfirmName(value)}
                placeholder=""
                autoComplete="off"
                leftIcon={<Container className="size-3.5" />}
                error={
                  confirmName.length > 0 && confirmName.trim() !== defaultName
                    ? `Type "${defaultName}" to confirm`
                    : undefined
                }
                classNames={{
                  field: 'h-10 rounded-md border-ds-border bg-ds-surface',
                  input: 'text-sm',
                }}
              />
            </div>

            <div className="flex w-full items-center justify-end gap-2.5">
              <DialogPrimitive.Close asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogPrimitive.Close>
              {confirmName.trim() === defaultName ? (
                <StatefulButton
                  type="button"
                  state={deleteMutation.isPending ? 'loading' : 'idle'}
                  loadingText="Deleting…"
                  disabled={deleteMutation.isPending}
                  onClick={() =>
                    deleteMutation.mutate({ confirmName: confirmName.trim() })
                  }
                  className="bg-ds-danger text-white hover:bg-ds-danger/90"
                >
                  Delete forever
                </StatefulButton>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled
                  className="h-9 gap-2 rounded-md border-ds-border bg-transparent px-3.5 text-xs font-semibold text-muted-foreground"
                >
                  <Trash2 className="size-[15px]" />
                  Delete forever
                </Button>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
