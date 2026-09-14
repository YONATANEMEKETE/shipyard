'use client';

import { format } from 'date-fns';
import { CheckCheck, ChevronLeft, Copy, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type { CycleDetail, CycleStatus } from '@shipyard/shared';

import {
  StatefulButton,
  type ButtonState,
} from '@/components/motion/button/stateful';
import { CycleStatusBadge } from '@/components/cycles/cycle-status-badge';
import { cycleLengthLabel } from '@/components/cycles/cycle-progress';

/**
 * Cycles detail header — the "Detail Header" from shipyard.pen
 * (Screen / Cycles - Detail / Active, I6UnVy): breadcrumb row with the back
 * link left and the date-range chip + copy-link button right, then the title
 * row (name + status chip, primary lifecycle action), the meta line, and the
 * divider.
 *
 * The primary action is the *legal* lifecycle move for the current status
 * rather than a hardcoded "Complete cycle": the design ships one header per
 * state (Planned → Start, Active → Complete, Completed → Reopen), and a
 * Complete button on a Planned cycle would only 409 at the API.
 *
 * The parent owns the write and resolves to a boolean, so the button can hold
 * its loading / success / error beat without an unhandled rejection (the same
 * contract as BlockedControl). Start / Complete / Reopen are confirmed actions
 * server-side (`{ confirm: true }`, supplied by the hook) but confirmed inline
 * today — a dedicated confirmation dialog is still the design's intent.
 */

const LIFECYCLE_ACTION: Record<
  CycleStatus,
  { label: string; loadingText: string; successText: string }
> = {
  PLANNED: {
    label: 'Start cycle',
    loadingText: 'Starting…',
    successText: 'Started',
  },
  ACTIVE: {
    label: 'Complete cycle',
    loadingText: 'Completing…',
    successText: 'Completed',
  },
  COMPLETED: {
    label: 'Reopen cycle',
    loadingText: 'Reopening…',
    successText: 'Reopened',
  },
};

/** How long the stateful button holds each beat before settling. */
const SUCCESS_HOLD = 700;
const ERROR_HOLD = 1600;

export function CycleDetailHeader({
  slug,
  cycle,
  onLifecycleAction,
  onOpenDetails,
}: {
  slug: string;
  cycle: CycleDetail;
  /** Runs the active status's lifecycle write. Resolves false on failure. */
  onLifecycleAction: () => Promise<boolean>;
  /** Opens the rail drawer below `lg` — same rail, different doorway. */
  onOpenDetails?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [buttonState, setButtonState] = useState<ButtonState>('idle');
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const copyLink = async () => {
    const url = `${window.location.origin}/w/${slug}/cycles/${cycle.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // silent — inline affordance only, no toast per design
    }
  };

  const runLifecycle = async () => {
    if (buttonState === 'loading') return;
    clearTimer();
    setButtonState('loading');
    const ok = await onLifecycleAction();
    setButtonState(ok ? 'success' : 'error');
    timerRef.current = window.setTimeout(
      () => {
        timerRef.current = null;
        setButtonState('idle');
      },
      ok ? SUCCESS_HOLD : ERROR_HOLD,
    );
  };

  const action = LIFECYCLE_ACTION[cycle.status];
  const start = new Date(`${cycle.startDate}T12:00:00`);
  const end = new Date(`${cycle.endDate}T12:00:00`);

  return (
    <div className="flex w-full shrink-0 flex-col gap-3">
      {/* Breadcrumb row — back link left, range + copy link right */}
      <div className="flex w-full items-center justify-between gap-3">
        <Link
          href={`/w/${slug}/cycles`}
          className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-3.5" />
          Back to Cycles
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          {/* The rail is an inline column from `lg` up and a drawer below it,
              so this doorway hides once there is room for the column. */}
          {onOpenDetails ? (
            <button
              type="button"
              onClick={onOpenDetails}
              className="inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-sm border border-ds-border bg-ds-surface-subtle px-2 text-[11px] font-semibold text-ds-text-muted transition-colors hover:text-foreground lg:hidden"
            >
              <SlidersHorizontal className="size-3 shrink-0" aria-hidden />
              Details
            </button>
          ) : null}
          <span
            title={`${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`}
            className="inline-flex h-[22px] items-center justify-center rounded border border-ds-border bg-ds-bg px-2 font-mono text-[10px] font-semibold text-muted-foreground"
          >
            {`${format(start, 'MMM dd')} – ${format(end, 'MMM dd')}`.toUpperCase()}
          </span>
          <button
            type="button"
            aria-label={copied ? 'Copied' : 'Copy cycle link'}
            onClick={copyLink}
            className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? (
              <CheckCheck aria-hidden className="size-[13px] text-ds-success" />
            ) : (
              <Copy aria-hidden className="size-[13px]" />
            )}
          </button>
        </div>
      </div>

      {/* Title row — name + status chip, primary lifecycle action */}
      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate text-[26px] font-bold leading-none tracking-[-0.5px] text-foreground">
            {cycle.name}
          </h1>
          <CycleStatusBadge status={cycle.status} />
        </div>

        <StatefulButton
          type="button"
          state={buttonState}
          onClick={runLifecycle}
          loadingText={action.loadingText}
          successText={action.successText}
          className="h-9 shrink-0 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90"
        >
          {action.label}
        </StatefulButton>
      </div>

      {/* Meta line — length + created date. No creator: `CycleCard` carries no
          author field, unlike the pen's "Created by … on …". */}
      <p className="text-[12px] text-muted-foreground">
        {cycleLengthLabel(cycle.startDate, cycle.endDate)} · Created{' '}
        {format(new Date(cycle.createdAt), 'MMM d, yyyy')}
      </p>

      <div className="h-px w-full bg-ds-border" aria-hidden />
    </div>
  );
}
