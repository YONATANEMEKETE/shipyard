import { ChevronLeft, ChevronRight } from 'lucide-react';
import { RotateCw, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import type { WorkspaceMemberCard, WorkspaceRole } from '@shipyard/shared';

import { MemberBadge } from '@/components/members/member-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Button } from '@/components/ui/button';
import { SPRING_LAYOUT } from '@/lib/ease';
import { cn } from '@/lib/utils';

/**
 * Members directory table — matches "Directory Card" in shipyard.pen
 * (576px white surface, mono column header, 48px rows, pagination footer).
 * Consumes WorkspaceMemberCard exactly as the members API returns it.
 */

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

const AVATAR_TONE: Record<WorkspaceRole, string> = {
  OWNER: 'bg-ds-brand text-white',
  ADMIN: 'border border-ds-info/30 bg-ds-info-soft text-ds-info',
  MEMBER: 'border border-ds-border bg-ds-surface-subtle text-muted-foreground',
};

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Skeleton row — mirrors MemberRow's cell geometry so loading → data swaps without layout shift. */
function MemberRowSkeleton() {
  return (
    <div
      aria-hidden
      data-testid="member-row-skeleton"
      className="flex h-12 items-center gap-3 border-b border-ds-border/70 px-4 last:border-b-0"
    >
      {/* Identity — avatar + name/email placeholders */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="size-7 shrink-0 animate-pulse rounded-full bg-ds-border/70" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="h-2.5 w-32 max-w-full animate-pulse rounded bg-ds-border/70" />
          <span className="h-2 w-48 max-w-full animate-pulse rounded bg-ds-border/40" />
        </div>
      </div>

      {/* Role cell — same 92px column as MemberBadge */}
      <div className="flex w-[92px] shrink-0 items-center justify-start">
        <span className="h-5 w-[68px] animate-pulse rounded-full bg-ds-border/70" />
      </div>

      {/* Joined cell — same ml-6 w-24 column */}
      <div className="ml-6 w-24 shrink-0">
        <span className="block h-2.5 w-16 animate-pulse rounded bg-ds-border/40" />
      </div>

      {/* Row action spacer */}
      <span className="size-[26px] shrink-0" />
    </div>
  );
}

function MemberRow({
  member,
  isCurrentUser,
  onOpen,
}: {
  member: WorkspaceMemberCard;
  isCurrentUser: boolean;
  onOpen: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
      className="flex h-12 cursor-pointer items-center gap-3 border-b border-ds-border/70 px-4 transition-colors hover:bg-ds-bg last:border-b-0"
    >
      {/* Identity — avatar + name/email */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {member.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.image}
            alt=""
            className="size-7 shrink-0 rounded-full border border-ds-border/60 object-cover"
          />
        ) : (
          <span
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-full font-mono text-[9px] font-bold',
              AVATAR_TONE[member.role],
            )}
          >
            {initialsOf(member.name)}
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[12.5px] font-semibold leading-none text-foreground">
              {member.name}
            </span>
            {isCurrentUser ? (
              <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-foreground px-1.5 font-mono text-[8px] font-bold leading-none text-white">
                YOU
              </span>
            ) : null}
          </span>
          <span className="truncate text-[10.5px] leading-none text-muted-foreground">
            {member.email}
          </span>
        </div>
      </div>

      {/* Role column — cell keeps the column width, the badge fits content */}
      <span className="flex w-[92px] shrink-0 items-center justify-start">
        <MemberBadge role={member.role} />
      </span>

      {/* Joined */}
      <span className="ml-6 w-24 shrink-0 text-[10.5px] text-muted-foreground">
        {formatJoined(member.createdAt)}
      </span>

      {/* Row action — opens the member details dialog */}
      <button
        type="button"
        aria-label={`Open ${member.name}`}
        onClick={onOpen}
        className="grid size-[26px] shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-ds-bg hover:text-foreground"
      >
        <motion.span
          initial={false}
          animate={{ x: hovered ? 3 : 0 }}
          transition={SPRING_LAYOUT}
          className="inline-grid"
        >
          <ChevronRight className="size-[13px]" />
        </motion.span>
      </button>
    </div>
  );
}

export function MembersTable({
  members,
  loading = false,
  error = false,
  onRetry,
  currentUserId,
  onOpenMember,
  emptyTitle,
  emptyDescription,
}: {
  members: WorkspaceMemberCard[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  currentUserId?: string;
  /** Open the member details dialog for a row — row and chevron both trigger it. */
  onOpenMember?: (member: WorkspaceMemberCard) => void;
  /** Customize the empty state copy — e.g. "no matches" when filters are active. */
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const showEmpty = !loading && !error && members.length === 0;
  const centered = (showEmpty || error) && !loading;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-ds-border bg-ds-surface">
      {/* Mono column header */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-ds-border bg-ds-bg px-4">
        <span className="flex-1 font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
          Member
        </span>
        <span className="w-[92px] text-left font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
          Role
        </span>
        <span className="ml-6 w-24 font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
          Joined
        </span>
        <span className="w-[26px]" />
      </div>

      {/* Rows */}
      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          centered && 'flex flex-col items-center justify-center',
        )}
      >
        {loading ? (
          Array.from({ length: 16 }, (_, index) => (
            <MemberRowSkeleton key={index} />
          ))
        ) : error ? (
          <ErrorState
            title="Couldn't load members"
            description="We ran into a problem fetching the member list. Try again in a moment."
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
        ) : showEmpty ? (
          <EmptyState
            icon={Users}
            title={emptyTitle ?? 'No members yet'}
            description={
              emptyDescription ??
              "Invite teammates to get started — they'll show up here once they accept."
            }
          />
        ) : (
          members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              isCurrentUser={member.userId === currentUserId}
              onOpen={
                onOpenMember ? () => onOpenMember(member) : () => undefined
              }
            />
          ))
        )}
        {/* Bottom fade — lets the last rows dissolve into the surface before the footer */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-ds-surface to-transparent"
        />
      </div>

      {/* Pagination footer — UI only for now */}
      <div className="flex h-[52px] shrink-0 items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous page"
            className="grid size-7 place-items-center rounded-md border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-[14px]" />
          </button>
          <button
            type="button"
            className="grid size-7 place-items-center rounded-md bg-ds-brand text-xs font-semibold text-white"
          >
            1
          </button>
          <button
            type="button"
            aria-label="Next page"
            className="grid size-7 place-items-center rounded-md border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight className="size-[14px]" />
          </button>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Showing 1–{members.length} of {members.length}{' '}
          {members.length === 1 ? 'member' : 'members'}
        </span>
      </div>
    </div>
  );
}
