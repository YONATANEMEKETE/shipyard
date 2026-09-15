'use client';

import { MessageSquare, RefreshCw, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { IssueStatusGlyph } from '@/components/issues/issue-status-badge';
import { cn } from '@/lib/utils';
import type {
  IssueCard,
  ProjectStatus,
  WorkspaceMemberCard,
} from '@shipyard/shared';

/**
 * Grouped-result row primitives — the row anatomy from "Element / Global
 * Search — Results" in shipyard.pen: h44, px12, gap10, radius 8, with a
 * leading glyph, the title (+ optional inline subtitle), a flex spacer, a
 * muted meta line and an optional trailing avatar.
 *
 * Rendered as real buttons so Enter/Space work natively; the dialog drives
 * the arrow-key selection via `active`. Colour/icon per entity comes from the
 * owning module's vocabulary (issue status glyph, project status dot, cycle
 * refresh glyph) — search never invents a status language of its own.
 */

// ── Group header ─────────────────────────────────────────────────────────────

export function SearchGroupHeader({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="px-3 pb-1.5 pt-2.5">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[1px] text-muted-foreground">
        {label} · {count}
      </span>
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

export interface SearchResultRowProps {
  title: string;
  /** Monospace muted token rendered before the title (SHIP-142, SHIP-24). */
  identifier?: string;
  /** Muted text rendered inline after the title (cycle goal, issue title…). */
  subtitle?: string;
  /** Right-aligned muted meta (status, dates, role, identifier). */
  meta?: string;
  leading: ReactNode;
  trailing?: ReactNode;
  active: boolean;
  onActivate: () => void;
  onHover: () => void;
  /** Stable DOM id so the dialog can scroll the active row into view. */
  id: string;
}

export function SearchResultRow({
  title,
  identifier,
  subtitle,
  meta,
  leading,
  trailing,
  active,
  onActivate,
  onHover,
  id,
}: SearchResultRowProps) {
  return (
    <button
      type="button"
      id={id}
      // The listbox owns arrow-key movement; the row only needs a click/Enter
      // target and an announcement of which option is current.
      aria-current={active ? 'true' : undefined}
      onMouseMove={onHover}
      onClick={onActivate}
      className={cn(
        'flex h-11 w-full items-center gap-2.5 rounded-md px-3 text-left outline-none transition-colors',
        active ? 'bg-ds-brand-soft' : 'hover:bg-ds-sidebar',
      )}
    >
      <span className="flex size-6 shrink-0 items-center justify-center">
        {leading}
      </span>
      {identifier ? (
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {identifier}
        </span>
      ) : null}
      <span className="min-w-0 truncate text-[13px] text-foreground">
        {title}
      </span>
      {subtitle ? (
        <span className="min-w-0 truncate text-[13px] text-muted-foreground">
          {subtitle}
        </span>
      ) : null}
      <span aria-hidden className="h-px min-w-0 flex-1" />
      {meta ? (
        <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
      ) : null}
      {trailing}
    </button>
  );
}

// ── Leading glyphs ───────────────────────────────────────────────────────────

export function IssueLeading({ issue }: { issue: IssueCard }) {
  return <IssueStatusGlyph status={issue.status} />;
}

const PROJECT_DOT: Record<ProjectStatus, string> = {
  PLANNED: 'bg-ds-info',
  ACTIVE: 'bg-ds-brand',
  COMPLETED: 'bg-ds-success',
};

export function ProjectLeading({ status }: { status: ProjectStatus }) {
  return (
    <span
      aria-hidden
      className={cn('size-2 rounded-full', PROJECT_DOT[status])}
    />
  );
}

export function CycleLeading() {
  return <RefreshCw aria-hidden className="size-4 text-muted-foreground" />;
}

export function CommentLeading() {
  return <MessageSquare aria-hidden className="size-4 text-muted-foreground" />;
}

export function MemberAvatar({ member }: { member: WorkspaceMemberCard }) {
  const initials = member.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');

  if (member.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.image}
        alt=""
        className="size-6 shrink-0 rounded-full border border-ds-border object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid size-6 shrink-0 place-items-center rounded-full border border-ds-brand/20 bg-ds-brand-soft font-mono text-[9px] font-bold text-ds-brand"
    >
      {initials}
    </span>
  );
}

export function AssigneeAvatar({
  name,
  image,
}: {
  name: string;
  image?: string | null;
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');

  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        className="size-5 shrink-0 rounded-full border border-ds-border object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid size-5 shrink-0 place-items-center rounded-full bg-ds-brand-soft font-mono text-[8px] font-bold text-ds-brand"
    >
      {initials}
    </span>
  );
}

// ── Loading ──────────────────────────────────────────────────────────────────

/** Skeleton rows — the "Element / Global Search — Loading" body variant. */
export function SearchLoadingRows({ rows = 5 }: { rows?: number }) {
  const widths = [210, 180, 240, 160, 200];
  return (
    <div className="flex w-full flex-col gap-1">
      {Array.from({ length: rows }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed skeleton count
        <div key={index} className="flex h-11 items-center gap-3 px-3">
          <span className="size-4 shrink-0 rounded-full border border-ds-border bg-ds-surface-subtle" />
          <span className="h-2.5 w-16 shrink-0 rounded-[5px] bg-ds-surface-subtle" />
          <span
            className="h-2.5 shrink-0 rounded-[5px] bg-ds-surface-subtle"
            style={{ width: widths[index % widths.length] }}
          />
          <span aria-hidden className="h-px min-w-0 flex-1" />
          <span className="h-2.5 w-14 shrink-0 rounded-[5px] bg-ds-surface-subtle" />
        </div>
      ))}
    </div>
  );
}

// ── Icons re-exported for the empty legend ───────────────────────────────────

export type { LucideIcon };
