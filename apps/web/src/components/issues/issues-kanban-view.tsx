'use client';

import { Kanban, Loader2, RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';

export function IssuesKanbanView({
  loading = false,
  error = false,
  onRetry,
}: {
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center">
        <Loader2
          aria-label="Loading issues"
          className="size-6 animate-spin text-muted-foreground"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center">
        <ErrorState
          title="Couldn't load issues"
          description="We ran into a problem fetching the board. Try again in a moment."
          action={
            onRetry ? (
              <Button
                type="button"
                variant="outline"
                onClick={onRetry}
                className="h-8 gap-2 rounded-md border-ds-border bg-ds-surface px-3 text-xs font-semibold text-foreground"
              >
                <RotateCw className="size-3.5" />
                Try again
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center">
      <EmptyState
        icon={Kanban}
        title="Kanban board is empty"
        description="There are no issues to display on the board in this view."
      />
    </div>
  );
}
