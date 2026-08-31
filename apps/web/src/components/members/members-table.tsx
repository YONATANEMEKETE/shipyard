import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import type { WorkspaceMemberCard, WorkspaceRole } from '@shipyard/shared';

import { MemberBadge } from '@/components/members/member-badge';
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
  ADMIN: 'border border-[#C9DAFF] bg-ds-info-soft text-ds-info',
  MEMBER: 'border border-ds-border bg-ds-surface-subtle text-muted-foreground',
};

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function MemberRow({ member }: { member: WorkspaceMemberCard }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex h-12 items-center gap-3 border-b border-ds-border/70 px-4 transition-colors hover:bg-ds-bg last:border-b-0"
    >
      {/* Identity — avatar + name/email */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-full font-mono text-[9px] font-bold',
            AVATAR_TONE[member.role],
          )}
        >
          {initialsOf(member.name)}
        </span>
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="truncate text-[12.5px] font-semibold leading-none text-foreground">
            {member.name}
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

      {/* Row action — member details drawer lands here later */}
      <button
        type="button"
        aria-label={`Open ${member.name}`}
        className="grid size-[26px] shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-ds-bg hover:text-foreground"
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

export function MembersTable({ members }: { members: WorkspaceMemberCard[] }) {
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
      <div className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {members.map((member) => (
          <MemberRow key={member.id} member={member} />
        ))}
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
            className="grid size-7 place-items-center rounded-lg border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-[14px]" />
          </button>
          <button
            type="button"
            className="grid size-7 place-items-center rounded-lg bg-ds-brand text-xs font-semibold text-white"
          >
            1
          </button>
          <button
            type="button"
            aria-label="Next page"
            className="grid size-7 place-items-center rounded-lg border border-ds-border bg-ds-bg text-muted-foreground transition-colors hover:text-foreground"
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
