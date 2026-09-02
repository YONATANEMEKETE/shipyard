'use client';

import { TextCursorInput, Trash2, TriangleAlert, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useState } from 'react';

import type { ProjectDetail } from '@shipyard/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatefulButton } from '@/components/motion/button/stateful';
import { useDeleteProject } from '@/hooks/use-projects';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

export interface DeleteProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  /** The project being deleted. */
  project: ProjectDetail | null;
  /** Called after the delete succeeds — the parent clears the selection. */
  onDeleted?: () => void;
}

/**
 * Delete Project Confirm — mirrors Element / Delete Project Confirm (IccaE)
 * in shipyard.pen: title + subcopy + warning banner (danger) + a name-typist
 * gate ("Type the project name to confirm") that arms the destructive Delete
 * button. Deletes via useDeleteProject; the confirm name is sent to the API
 * and the detail cache is dropped, list/board refetched, selection cleared.
 * The banner copy reads neutral until F5 ships the issue unassign leg (the
 * API response's unassignedIssues is then surfaced in the success toast).
 */
export function DeleteProjectDialog({
  open,
  onOpenChange,
  slug,
  project,
  onDeleted,
}: DeleteProjectDialogProps) {
  const { showToast } = useToast();
  const [confirmName, setConfirmName] = useState('');

  // Fresh confirm each open — clear the typed name.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setConfirmName('');
  }

  const deleteMutation = useDeleteProject(slug, {
    onSuccess: (response) => {
      showToast({
        status: 'success',
        title: 'Project deleted',
        description:
          response.unassignedIssues > 0
            ? `${response.unassignedIssues} issues were unassigned.`
            : undefined,
      });
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: "Couldn't delete project",
        description: error.message || 'Please try again.',
      });
    },
  });

  if (!project) return null;

  const matchesName = confirmName.trim() === project.name;
  const canSubmit = matchesName && !deleteMutation.isPending;

  const onConfirm = () => {
    if (!matchesName) return;
    deleteMutation.mutate({
      projectId: project.id,
      body: { confirmName: confirmName.trim() },
    });
  };

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
                Delete project?
              </DialogPrimitive.Title>
              <p className="text-[12px] leading-[1.55] text-muted-foreground">
                This permanently deletes the project. Its issues stay in the
                workspace but are unassigned. This can&apos;t be undone.
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

          {/* Warning banner */}
          <div className="flex w-full items-center gap-2.5 rounded-md border border-ds-danger bg-ds-danger-soft px-3.5 py-3">
            <TriangleAlert className="size-4 shrink-0 text-ds-danger" />
            <span className="text-xs leading-[1.5] text-ds-danger">
              Issues will be unassigned but not deleted.
            </span>
          </div>

          {/* Typed-name gate */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-foreground">
              Type the project name to confirm
            </span>
            <Input
              value={confirmName}
              onChange={(value) => setConfirmName(value)}
              onBlur={() => {}}
              placeholder={project.name}
              leftIcon={
                <TextCursorInput className="size-3.5 text-muted-foreground" />
              }
              disabled={deleteMutation.isPending}
              error={
                confirmName !== '' && !matchesName
                  ? 'Name does not match'
                  : undefined
              }
              classNames={{
                field: 'h-9 rounded-md border-ds-border bg-ds-surface',
                input: 'text-sm',
              }}
            />
          </div>

          {/* Footer */}
          <div className="flex w-full items-center justify-end gap-2.5 pt-1">
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                disabled={deleteMutation.isPending}
                className="h-9 gap-1.5"
              >
                <X className="size-3.5" />
                Cancel
              </Button>
            </DialogPrimitive.Close>
            <StatefulButton
              type="button"
              onClick={onConfirm}
              className="h-9 gap-2 rounded-md bg-ds-danger px-4 text-sm font-semibold text-white hover:bg-ds-danger/90 disabled:opacity-50"
              state={deleteMutation.isPending ? 'loading' : 'idle'}
              loadingText="Deleting…"
              successText="Deleted"
              icon={<Trash2 className="size-4" />}
              disabled={!canSubmit}
            >
              Delete project
            </StatefulButton>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
