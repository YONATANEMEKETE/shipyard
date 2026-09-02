'use client';

import { Archive, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import type { ProjectDetail } from '@shipyard/shared';
import { Button } from '@/components/ui/button';
import { StatefulButton } from '@/components/motion/button/stateful';
import { useArchiveProject } from '@/hooks/use-projects';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

export interface ArchiveProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  /** The project being archived. */
  project: ProjectDetail | null;
  /** Called after a successful archive — the parent clears the selection. */
  onArchived?: () => void;
}

/**
 * Archive Project Confirm — mirrors Element / Archive Project Confirm (tcXhg)
 * in shipyard.pen: a compact 500w modal with title + subcopy + X and a
 * Cancel (Ghost) / Archive (Destructive) footer. Archives via
 * useArchiveProject; the mutation updates the detail cache, invalidates the
 * lists (the project leaves boards/lists) and the parent clears the selection.
 */
export function ArchiveProjectDialog({
  open,
  onOpenChange,
  slug,
  project,
  onArchived,
}: ArchiveProjectDialogProps) {
  const { showToast } = useToast();

  const archiveMutation = useArchiveProject(slug, {
    onSuccess: (archived) => {
      showToast({
        status: 'success',
        title: 'Project archived',
        description: `${archived.name} is hidden from boards and lists.`,
      });
      onOpenChange(false);
      onArchived?.();
    },
    onError: (error) => {
      showToast({
        status: 'error',
        title: "Couldn't archive project",
        description: error.message || 'Please try again.',
      });
    },
  });

  if (!project) return null;

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
                Archive project?
              </DialogPrimitive.Title>
              <p className="text-[12px] leading-[1.55] text-muted-foreground">
                Archiving hides it from boards and lists. You can restore it
                anytime; its status is kept.
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

          {/* Footer */}
          <div className="flex w-full items-center justify-end gap-2.5 pt-1">
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                disabled={archiveMutation.isPending}
                className="h-9 gap-1.5"
              >
                <X className="size-3.5" />
                Cancel
              </Button>
            </DialogPrimitive.Close>
            <StatefulButton
              type="button"
              onClick={() => archiveMutation.mutate({ projectId: project.id })}
              className="h-9 gap-2 rounded-md bg-ds-danger px-4 text-sm font-semibold text-white hover:bg-ds-danger/90 disabled:opacity-50"
              state={archiveMutation.isPending ? 'loading' : 'idle'}
              loadingText="Archiving…"
              successText="Archived"
              icon={<Archive className="size-4" />}
              disabled={archiveMutation.isPending}
            >
              Archive
            </StatefulButton>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
