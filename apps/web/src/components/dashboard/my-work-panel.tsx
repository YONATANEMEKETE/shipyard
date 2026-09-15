'use client';

import { History, PenLine, RotateCw, UserCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { IssueCard } from '@shipyard/shared';

import { IssueRow } from '@/components/issues/issues-list-view';
import {
  RailSectionHeader,
  ViewAllLink,
} from '@/components/dashboard/rail-section-header';
import { Loader } from '@/components/motion/loader';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useDashboard } from '@/hooks/use-dashboard';

/**
 * My Work — the dashboard's left column, mirroring "My Work Column" (cPio7)
 * in `Screen / Dashboard` (s4L8ST): a header row with a "View all issues"
 * link, then three groups of issue rows.
 *
 * The rows are the issue list's own `IssueRow`, not a reimplementation, so a
 * change to the row lands in both places. The one deliberate difference from
 * `IssuesListView` is that these groups do not collapse — the panel is a
 * summary, and each group is already capped server-side, so folding them away
 * would only hide the answer.
 *
 * Groups come from the API as three separate arrays rather than one list with
 * a discriminator, so there is nothing to group client-side; an issue can
 * legitimately appear under both "Assigned to you" and "Recently viewed".
 */

type GroupKey = 'assigned' | 'created' | 'recentlyViewed';

/**
 * The panel is a preview, not the list. Four issues per group, with
 * "View all issues" as the way to the rest; the API caps each group at ten.
 */
const MAX_PER_GROUP = 4;

const GROUP_ORDER = ['assigned', 'created', 'recentlyViewed'] as const;

const GROUP_META: Record<
  GroupKey,
  {
    label: string;
    icon: LucideIcon;
    emptyTitle: string;
    emptyDescription: string;
  }
> = {
  assigned: {
    label: 'Assigned to you',
    icon: UserCheck,
    emptyTitle: 'Nothing assigned',
    emptyDescription: 'Issues assigned to you will show up here.',
  },
  created: {
    label: 'Created by you',
    icon: PenLine,
    emptyTitle: 'Nothing created yet',
    emptyDescription: 'Issues you create will show up here.',
  },
  recentlyViewed: {
    label: 'Recently viewed',
    icon: History,
    emptyTitle: 'Nothing viewed yet',
    emptyDescription: 'Issues you open will show up here.',
  },
};

function GroupHeader({
  label,
  icon: Icon,
  count,
}: {
  label: string;
  icon: LucideIcon;
  count: number;
}) {
  return (
    <div className="flex h-9 w-full items-center gap-2 border-b border-ds-border bg-ds-surface-subtle px-4">
      <Icon aria-hidden className="size-3.5 shrink-0 text-ds-text-muted" />
      <span className="text-[12.5px] font-semibold leading-none text-foreground">
        {label}
      </span>
      <span className="font-mono text-[10px] font-semibold leading-none text-ds-text-muted">
        {count}
      </span>
    </div>
  );
}

export function MyWorkPanel({ slug }: { slug: string }) {
  const router = useRouter();
  const query = useDashboard(slug);

  const groups = GROUP_ORDER.map((key) => ({
    key,
    // The full group, before the preview cap — the header counts the group, not
    // the rows on screen, so it matches what "View all issues" leads to.
    issues: (query.data?.myWork[key] ?? []) as IssueCard[],
  }));

  const openIssue = (issue: IssueCard) =>
    router.push(`/w/${slug}/issues/${issue.id}`);

  return (
    <section
      aria-label="My work"
      className="flex w-full flex-col gap-2.5 lg:min-w-0 lg:flex-[1.63]"
    >
      {/* Header — mono label left, "View all issues" link right. */}
      <RailSectionHeader
        label="My Work"
        action={
          <ViewAllLink href={`/w/${slug}/issues`} label="View all issues" />
        }
      />

      <div className="flex w-full flex-col">
        {query.isPending ? (
          <div className="flex min-h-[220px] w-full items-center justify-center">
            <Loader size={28} variant="spinner" label="Loading my work" />
          </div>
        ) : query.isError ? (
          <div className="flex min-h-[220px] w-full items-center justify-center">
            <ErrorState
              title="Couldn't load your work"
              description="We ran into a problem fetching your assigned and created issues."
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => query.refetch()}
                  className="h-8 gap-2 rounded-md border-ds-border bg-ds-surface px-3 text-xs font-semibold text-foreground"
                >
                  <RotateCw className="size-3.5" />
                  Try again
                </Button>
              }
            />
          </div>
        ) : (
          // Every group always renders — header, then rows or its own empty
          // state. Hiding an empty group made the panel ambiguous: a missing
          // group reads as a bug, where "Nothing assigned" reads as an answer.
          groups.map((group) => {
            const meta = GROUP_META[group.key];
            const preview = group.issues.slice(0, MAX_PER_GROUP);
            return (
              <section
                key={group.key}
                aria-label={meta.label}
                className="flex w-full flex-col"
              >
                <GroupHeader
                  label={meta.label}
                  icon={meta.icon}
                  count={group.issues.length}
                />
                {preview.length === 0 ? (
                  <EmptyState
                    icon={meta.icon}
                    title={meta.emptyTitle}
                    description={meta.emptyDescription}
                    // Trimmed from the default `py-10`: three groups share this
                    // panel, so an untrimmed tile in each empty one would run
                    // the column far past the rail beside it.
                    className="py-6"
                  />
                ) : (
                  preview.map((issue) => (
                    <IssueRow
                      key={issue.id}
                      issue={issue}
                      onOpen={() => openIssue(issue)}
                    />
                  ))
                )}
              </section>
            );
          })
        )}
      </div>
    </section>
  );
}
