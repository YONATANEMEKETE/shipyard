'use client';

import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  IssuesToolbar,
  type IssueFilters,
  type IssueScope,
} from '@/components/issues/issues-toolbar';
import { IssuesListView } from '@/components/issues/issues-list-view';
import { IssuesKanbanView } from '@/components/issues/issues-kanban-view';
import { CreateIssueDialog } from '@/components/issues/create-issue-dialog';
import { useWorkspace } from '@/hooks/use-workspaces';
import type { IssueStatus } from '@shipyard/shared';
import { useViewPreference } from '@/hooks/use-projects';
import { useSession } from '@/hooks/use-session';
import { useIssues, useUpdateIssue } from '@/hooks/use-issues';
import { useToast } from '@/components/providers/toast-provider';

/**
 * Issues page — header + toolbar with live filters.
 * Mirrors ProjectsPage data pattern: parent lifts filter + scope state,
 * drives the issues query, and passes roster-fed counts to the toolbar.
 * List / kanban views consume the same query next (not in this pass).
 */
export function IssuesPage({ slug }: { slug: string }) {
  const { data: workspace } = useWorkspace(slug);
  const canCreate = workspace?.role !== 'MEMBER';

  const { data: session } = useSession();
  const { data: viewPref } = useViewPreference(slug, 'ISSUE');
  const view = viewPref?.view ?? 'LIST';

  const [scope, setScope] = useState<IssueScope>('ALL');
  const [filters, setFilters] = useState<IssueFilters>({
    search: '',
    order: 'desc',
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<IssueStatus | undefined>(
    undefined,
  );
  const openCreate = (status?: IssueStatus) => {
    setCreateStatus(status);
    setCreateOpen(true);
  };

  const q = filters.search.trim();
  const queryQ = q.length >= 2 ? q : q.length === 0 ? undefined : undefined;
  // API requires q >= 2 chars; single-char searches stay client-side (no param).
  // Send only when >=2 to avoid 400; empty means no filter.

  const listParams = useMemo(() => {
    const base = {
      priority: filters.priority,
      projectId: filters.projectId,
      labels: filters.labelId ? [filters.labelId] : undefined,
      dueDateFrom: filters.dueDate,
      dueDateTo: filters.dueDate,
      q: queryQ,
      sort: 'createdAt' as const,
      order: filters.order,
    };

    if (scope === 'ARCHIVED') {
      return { archived: 'true' as const, q: queryQ };
    }
    if (scope === 'MY') {
      const me = session?.user.id;
      if (!me) return { ...base, assigneeId: '__pending__' as string };
      return { ...base, assigneeId: me };
    }
    // ALL: honour the assignee pill when set
    return { ...base, assigneeId: filters.assigneeId };
  }, [filters, scope, queryQ, session?.user.id]);

  // Main live query — drives future list/kanban and validates toolbar wiring.
  const issuesQuery = useIssues(slug, listParams);

  // Tab counts — lightweight unfiltered counts per scope (no filter pills applied).
  // Mirrors ProjectsPage All badge (unfiltered total). MY needs session.
  const allCountQuery = useIssues(slug, undefined);
  const archivedCountQuery = useIssues(slug, { archived: 'true' });
  const myCountQuery = useIssues(
    slug,
    session?.user.id ? { assigneeId: session.user.id } : undefined,
    { enabled: Boolean(session?.user.id) },
  );

  const counts: Partial<Record<IssueScope, number>> = {
    ALL: allCountQuery.data?.issues.length,
    ARCHIVED: archivedCountQuery.data?.issues.length,
    ...(myCountQuery.data ? { MY: myCountQuery.data.issues.length } : {}),
  };

  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.priority !== undefined ||
    filters.assigneeId !== undefined ||
    filters.projectId !== undefined ||
    filters.labelId !== undefined ||
    filters.dueDate !== undefined;

  const issues = issuesQuery.data?.issues ?? [];

  const { showToast } = useToast();
  const updateIssueMutation = useUpdateIssue(slug);
  const moveIssue = (issueId: string, status: IssueStatus) =>
    updateIssueMutation
      .mutateAsync({ issueId, body: { status } })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Please try again.';
        showToast({
          status: 'error',
          title: "Couldn't move issue",
          description: message,
        });
        throw error;
      });

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-ds-brand">
        Issues
      </span>

      {/* Header row — matches ProjectsPage: eyebrow + 28px title */}
      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="text-[28px] font-bold leading-none tracking-[-1px] text-foreground">
            Issues
          </h1>
          <p className="text-[13px] leading-[1.5] text-muted-foreground">
            Track and resolve work across your workspace.
          </p>
        </div>

        {canCreate ? (
          <Button
            type="button"
            onClick={() => openCreate()}
            className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90"
          >
            <Plus className="size-4" />
            New issue
          </Button>
        ) : null}
      </div>

      <IssuesToolbar
        slug={slug}
        filters={filters}
        onChange={setFilters}
        scope={scope}
        onScopeChange={setScope}
        counts={counts}
      />

      {/* Content area — list / kanban (archived is list-only). */}
      <div className="flex min-h-0 flex-1 flex-col">
        {scope === 'ARCHIVED' || view === 'LIST' ? (
          <IssuesListView
            issues={issues}
            loading={issuesQuery.isPending}
            error={issuesQuery.isError}
            onRetry={() => issuesQuery.refetch()}
            hasActiveFilters={hasActiveFilters}
            onAddIssue={openCreate}
          />
        ) : (
          <IssuesKanbanView
            slug={slug}
            issues={issues}
            search={filters.search}
            onAddIssue={openCreate}
            onStatusChange={moveIssue}
            loading={issuesQuery.isPending}
            error={issuesQuery.isError}
            onRetry={() => issuesQuery.refetch()}
          />
        )}
      </div>

      <CreateIssueDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        slug={slug}
        defaultStatus={createStatus}
      />
    </div>
  );
}
