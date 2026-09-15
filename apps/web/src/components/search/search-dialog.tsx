'use client';

import { Search, SearchX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  CycleCard,
  IssueCard,
  ProjectCard,
  SearchCommentHit,
  WorkspaceMemberCard,
} from '@shipyard/shared';

import { ISSUE_STATUS_META } from '@/components/issues/issue-status-badge';
import { Loader } from '@/components/motion/loader';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import {
  useDebouncedValue,
  useDelayedFlag,
  useSearch,
} from '@/hooks/use-search';
import { cn } from '@/lib/utils';

import { SearchEmptyBody } from './search-empty-body';
import {
  AssigneeAvatar,
  CommentLeading,
  CycleLeading,
  IssueLeading,
  MemberAvatar,
  ProjectLeading,
  SearchGroupHeader,
  SearchLoadingRows,
  SearchResultRow,
} from './search-result-row';
import { SearchTypeSelect, type SearchScope } from './search-type-select';

/**
 * Global search dialog — "Screen / Global Search — Open Over Workspace" in
 * shipyard.pen, with the four designed body variants:
 *
 *   blank query   → Element / Global Search — Empty (intro + scope + legend)
 *   first fetch   → Element / Global Search — Loading (header spinner + skeletons)
 *   no matches    → the shared EmptyState (no-results, query echoed)
 *   request fails → the shared ErrorState (retry)
 *   matches       → Element / Global Search — Results (grouped, ranked rows)
 *
 * Opened by the header's search icon or ⌘K / Ctrl+K. Searching is debounced
 * ~250ms and every keystroke supersedes the previous request via the query key
 * (spec: search-as-you-type must never create unbounded server work).
 *
 * Footer advertises the keyboard model and the dialog implements it: ↑↓ moves
 * the active row, ↵ activates it (identical to clicking), ESC closes.
 */

const TYPE_GROUPS = [
  { key: 'issues', label: 'Issues' },
  { key: 'projects', label: 'Projects' },
  { key: 'cycles', label: 'Cycles' },
  { key: 'members', label: 'Members' },
  { key: 'comments', label: 'Comments' },
] as const;

type SearchHit =
  | { key: string; kind: 'issue'; issue: IssueCard }
  | { key: string; kind: 'project'; project: ProjectCard }
  | { key: string; kind: 'cycle'; cycle: CycleCard }
  | { key: string; kind: 'member'; member: WorkspaceMemberCard }
  | { key: string; kind: 'comment'; comment: SearchCommentHit };

interface SearchGroup {
  key: string;
  label: string;
  hits: SearchHit[];
  /** Index of this group's first hit in the flattened list. */
  start: number;
}

const CYCLE_STATUS_LABEL: Record<CycleCard['status'], string> = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
};

const PROJECT_STATUS_LABEL: Record<ProjectCard['status'], string> = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
};

const ROLE_LABEL: Record<WorkspaceMemberCard['role'], string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
};

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export interface SearchDialogProps {
  slug: string;
  workspaceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({
  slug,
  workspaceName,
  open,
  onOpenChange,
}: SearchDialogProps) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');
  const [scopeOpen, setScopeOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const debounced = useDebouncedValue(input, 250);
  const hasQuery = input.trim().length > 0;
  // Feed an empty query while the input is blank so a reopen within the
  // debounce window can't fire a request for the previous query.
  const query = useSearch(
    slug,
    { q: hasQuery ? debounced : '', type: scope === 'all' ? undefined : scope },
    { enabled: open },
  );

  // Groups keep the API's five-way order; empty groups are pruned rather than
  // shown as "Issues · 0" (api-design §9.3).
  const groups = useMemo<SearchGroup[]>(() => {
    const data = query.data;
    if (!data) return [];
    const byKey: Record<string, SearchHit[]> = {
      issues: data.issues.map((issue) => ({
        key: `issue-${issue.id}`,
        kind: 'issue',
        issue,
      })),
      projects: data.projects.map((project) => ({
        key: `project-${project.id}`,
        kind: 'project',
        project,
      })),
      cycles: data.cycles.map((cycle) => ({
        key: `cycle-${cycle.id}`,
        kind: 'cycle',
        cycle,
      })),
      members: data.members.map((member) => ({
        key: `member-${member.id}`,
        kind: 'member',
        member,
      })),
      comments: data.comments.map((comment) => ({
        key: `comment-${comment.id}`,
        kind: 'comment',
        comment,
      })),
    };
    let cursor = 0;
    return TYPE_GROUPS.map(({ key, label }) => {
      const hits = byKey[key] ?? [];
      const group: SearchGroup = { key, label, hits, start: cursor };
      cursor += hits.length;
      return group;
    }).filter((group) => group.hits.length > 0);
  }, [query.data]);

  const flat = useMemo(() => groups.flatMap((group) => group.hits), [groups]);

  const reset = useCallback(() => {
    setInput('');
    setScope('all');
    setScopeOpen(false);
    setActiveIndex(0);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      onOpenChange(next);
      if (!next) reset();
    },
    [onOpenChange, reset],
  );

  // ⌘K / Ctrl+K toggles the dialog from anywhere in the workspace shell.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        handleOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleOpenChange]);

  // A new result set re-anchors the cursor on the top hit. Adjusted during
  // render (not in an effect) so the reset lands in the same commit as the new
  // results — no frame with a stale index.
  const [prevFlat, setPrevFlat] = useState(flat);
  if (prevFlat !== flat) {
    setPrevFlat(flat);
    setActiveIndex(0);
  }

  // Keep the active row visible while arrowing through a long list.
  useEffect(() => {
    document
      .getElementById(`search-option-${activeIndex}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const openHit = useCallback(
    (hit: SearchHit) => {
      handleOpenChange(false);
      switch (hit.kind) {
        case 'issue':
          router.push(`/w/${slug}/issues/${hit.issue.id}`);
          break;
        case 'comment':
          // Permalink convention owned by the comments module (api-design #2).
          router.push(
            `/w/${slug}/issues/${hit.comment.issueId}#comment-${hit.comment.id}`,
          );
          break;
        case 'project':
          // Projects page opens the inline detail panel for the `?project=` id.
          router.push(`/w/${slug}/projects?project=${hit.project.id}`);
          break;
        case 'cycle':
          router.push(`/w/${slug}/cycles/${hit.cycle.id}`);
          break;
        case 'member':
          // Members page opens the details dialog for the `?member=` id.
          router.push(`/w/${slug}/members?member=${hit.member.id}`);
          break;
      }
    },
    [handleOpenChange, router, slug],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    // While the scope option list is open it owns the keyboard (Radix/Select
    // handles Escape); the result cursor must not move underneath it.
    if (scopeOpen) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (flat.length > 0) {
        setActiveIndex((index) => Math.min(index + 1, flat.length - 1));
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      const hit = flat[activeIndex];
      if (!hit) return;
      event.preventDefault();
      openHit(hit);
    }
  };

  // Skeleton shows only once the in-flight search has taken long enough to be
  // worth showing — otherwise the previous result stays put for a beat.
  const awaitingFreshResults =
    query.isFetching && (query.isPending || query.isPlaceholderData);
  const showSkeleton = useDelayedFlag(awaitingFreshResults);

  const renderHit = (hit: SearchHit, index: number) => {
    const row = {
      active: index === activeIndex,
      onActivate: () => openHit(hit),
      onHover: () => setActiveIndex(index),
      id: `search-option-${index}`,
    };

    switch (hit.kind) {
      case 'issue':
        return (
          <SearchResultRow
            key={hit.key}
            {...row}
            leading={<IssueLeading issue={hit.issue} />}
            identifier={hit.issue.identifier}
            title={hit.issue.title}
            meta={ISSUE_STATUS_META[hit.issue.status].label}
            trailing={
              hit.issue.assignee ? (
                <AssigneeAvatar
                  name={hit.issue.assignee.name}
                  image={hit.issue.assignee.image}
                />
              ) : undefined
            }
          />
        );
      case 'project':
        return (
          <SearchResultRow
            key={hit.key}
            {...row}
            leading={<ProjectLeading status={hit.project.status} />}
            title={hit.project.name}
            meta={`${PROJECT_STATUS_LABEL[hit.project.status]} · ${hit.project.owner.name}`}
            trailing={
              <AssigneeAvatar
                name={hit.project.owner.name}
                image={hit.project.owner.image}
              />
            }
          />
        );
      case 'cycle':
        return (
          <SearchResultRow
            key={hit.key}
            {...row}
            leading={<CycleLeading />}
            title={hit.cycle.name}
            meta={`${CYCLE_STATUS_LABEL[hit.cycle.status]} · ${formatDay(
              hit.cycle.startDate,
            )} – ${formatDay(hit.cycle.endDate)}`}
          />
        );
      case 'member':
        return (
          <SearchResultRow
            key={hit.key}
            {...row}
            leading={<MemberAvatar member={hit.member} />}
            title={hit.member.name}
            meta={ROLE_LABEL[hit.member.role]}
          />
        );
      case 'comment':
        return (
          <SearchResultRow
            key={hit.key}
            {...row}
            leading={<CommentLeading />}
            title={hit.comment.author.name}
            subtitle={hit.comment.content.replace(/\s+/g, ' ').trim()}
            meta={hit.comment.issueIdentifier}
          />
        );
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#17171773] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          className={cn(
            'fixed left-1/2 top-[13%] z-50 flex max-h-[76vh] w-[680px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-ds-border-strong bg-ds-surface shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Search workspace
          </DialogPrimitive.Title>

          {/* Header row — query input, with the "search within" selector pinned
              top-right (the Results variant's Search Within Dropdown). While a
              search is in flight the selector yields to the Loading spinner. */}
          <div className="flex h-[52px] shrink-0 items-center gap-3 px-[18px]">
            <Search
              aria-hidden
              className="size-[18px] shrink-0 text-muted-foreground"
            />
            <input
              autoFocus
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Search workspace…"
              aria-label="Search workspace"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {query.isFetching ? (
              <Loader
                variant="spinner"
                size={16}
                label="Searching"
                className="text-muted-foreground"
              />
            ) : (
              <SearchTypeSelect
                value={scope}
                onValueChange={setScope}
                open={scopeOpen}
                onOpenChange={setScopeOpen}
              />
            )}
          </div>

          <div className="h-px w-full shrink-0 bg-ds-border" />

          {/* Body — the dialog's only scroll container. The scrollbar is
              styled rather than hidden (the app hides it in list/table panes,
              but a dialog keeps the affordance): a pill thumb inset by a
              transparent border, so it reads as a thin floating rail on the
              ds-surface panel, and darkens on hover. */}
          <div
            className={cn(
              'min-h-[212px] flex-1 overflow-y-auto overscroll-contain p-4',
              '[scrollbar-width:thin] [scrollbar-color:var(--ds-border-strong)_transparent]',
              '[&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:bg-transparent',
              '[&::-webkit-scrollbar-thumb]:rounded-full',
              '[&::-webkit-scrollbar-thumb]:border-[3px] [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent',
              '[&::-webkit-scrollbar-thumb]:bg-clip-content [&::-webkit-scrollbar-thumb]:bg-ds-border-strong',
              'hover:[&::-webkit-scrollbar-thumb]:bg-ds-text-muted',
            )}
          >
            {!hasQuery ? (
              <SearchEmptyBody workspaceName={workspaceName} />
            ) : showSkeleton ? (
              <SearchLoadingRows />
            ) : query.isError ? (
              <ErrorState
                title="Search failed"
                description={query.error?.message}
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void query.refetch()}
                  >
                    Try again
                  </Button>
                }
              />
            ) : flat.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title={`No results for “${debounced.trim()}”`}
                description="Try different keywords or check the spelling."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setInput('');
                      setActiveIndex(0);
                    }}
                  >
                    Clear search
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {groups.map((group) => (
                  <div key={group.key} className="flex flex-col">
                    <SearchGroupHeader
                      label={group.label}
                      count={group.hits.length}
                    />
                    {group.hits.map((hit, offset) =>
                      renderHit(hit, group.start + offset),
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="h-px w-full shrink-0 bg-ds-border" />

          {/* Footer — the keyboard model the dialog implements */}
          <div className="flex h-11 shrink-0 items-center gap-[18px] px-4">
            <SearchHint keyLabel="↑↓" hint="Navigate" />
            <SearchHint keyLabel="↵" hint="Open" />
            <SearchHint keyLabel="ESC" hint="Close" />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SearchHint({ keyLabel, hint }: { keyLabel: string; hint: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex h-[22px] items-center justify-center rounded border border-ds-border bg-ds-sidebar px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
        {keyLabel}
      </span>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </span>
  );
}
