'use client';

import { CircleDashed, OctagonAlert } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { IssueStatus } from '@shipyard/shared';

import {
  StatefulButton,
  type ButtonState,
} from '@/components/motion/button/stateful';
import { Loader } from '@/components/motion/loader';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Mirrors `blockedReasonSchema` in @shipyard/shared — max 500, empty
 * normalizes to null server-side. Kept local so the counter and the server
 * contract can be read side by side.
 */
export const BLOCKED_REASON_MAX = 500;

/** The counter stays hidden below this length so the popover stays quiet. */
const COUNTER_FROM = 400;

const DONE_HINT =
  "Completed issues can't be blocked. Reopen the issue to flag it again.";

/** How long the stateful button holds each beat before the popover settles. */
const SUCCESS_HOLD = 700;
const ERROR_HOLD = 1600;

/**
 * A blocked write resolves to `false` to signal failure; anything else (or a
 * sync return) counts as success. Returning `false` instead of rejecting keeps
 * the toast as the single error surface and avoids unhandled rejections.
 */
type BlockedResult = void | boolean | Promise<void | boolean>;

/**
 * Blocked control for the issue properties rail — `NfFd2` "Blocked Row" in
 * shipyard.pen.
 *
 * Blocked is an orthogonal flag, never a workflow status (spec §3.3): this
 * control must not touch `status`, and only unfinished issues may set it.
 * Popover-first — one interaction opens the reason capture, and confirming
 * sends a single PATCH (#4), so blocking never needs a second write.
 *
 * Render-only situations (the parent still owns the mutation):
 * - `archived` → static text, the issue is read-only
 * - `status === 'DONE'` → disabled with the reopen hint
 * - `pending` → trigger disabled while the PATCH is in flight
 *
 * Desktop-only, like the rest of the rail (the rail itself is `lg:flex`).
 */
export function BlockedControl({
  blocked,
  blockedReason,
  status,
  archived = false,
  pending = false,
  onSet,
  onEditReason,
  onClear,
}: {
  blocked: boolean;
  blockedReason: string | null;
  status: IssueStatus;
  archived?: boolean;
  pending?: boolean;
  onSet: (reason: string | null) => BlockedResult;
  onEditReason: (reason: string | null) => BlockedResult;
  onClear: () => BlockedResult;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(blockedReason ?? '');
  const [submitState, setSubmitState] = useState<ButtonState>('idle');
  const [unblockState, setUnblockState] = useState<ButtonState>('idle');
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  // Each open starts from the persisted reason so a cancelled or dismissed
  // edit never sticks. Reset on the open event rather than in an effect.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDraft(blockedReason ?? '');
    } else {
      clearTimer();
      setSubmitState('idle');
      setUnblockState('idle');
    }
    setOpen(next);
  };

  const trimmed = draft.trim();
  const normalized = trimmed === '' ? null : trimmed;
  const reasonChanged = normalized !== (blockedReason ?? null);
  const showCounter = trimmed.length >= COUNTER_FROM;

  // Both actions write to the same issue, so neither may fire while the other
  // is in flight or showing its success beat. An error beat releases both, so a
  // retry is never gated on a timer.
  const committing = submitState === 'loading' || unblockState === 'loading';
  const settling = submitState === 'success' || unblockState === 'success';
  const locked = committing || settling;

  /**
   * Drives one button's state machine. A handler that returns a promise gets
   * the loading → success/error beats; a sync handler just commits and closes,
   * which is what the mocked handlers in tests do.
   */
  const run = (
    action: () => BlockedResult,
    target: (next: ButtonState) => void,
    onSuccess: () => void,
  ) => {
    const result = action();
    if (!(result instanceof Promise)) {
      onSuccess();
      return;
    }
    target('loading');
    void result.then((ok) => {
      if (ok !== false) {
        target('success');
        timerRef.current = window.setTimeout(() => {
          target('idle');
          onSuccess();
        }, SUCCESS_HOLD);
      } else {
        // Stay open so the reason is still there to retry against.
        target('error');
        timerRef.current = window.setTimeout(() => target('idle'), ERROR_HOLD);
      }
    });
  };

  const submit = () => {
    if (blocked) {
      if (!reasonChanged) return;
      run(
        () => onEditReason(normalized),
        setSubmitState,
        () => setOpen(false),
      );
    } else {
      run(
        () => onSet(normalized),
        setSubmitState,
        () => setOpen(false),
      );
    }
  };

  const value = (
    <span
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium',
        blocked ? 'text-ds-danger' : 'text-foreground',
      )}
    >
      {blocked ? (
        <OctagonAlert className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <CircleDashed
          className="size-3.5 shrink-0 text-ds-text-muted"
          aria-hidden
        />
      )}
      {blocked ? 'Yes' : 'No'}
    </span>
  );

  let control: ReactNode;

  if (archived) {
    // Archived issues are read-only; the flag survives and is shown as-is.
    control = value;
  } else if (status === 'DONE') {
    control = (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              data-testid="blocked-control-disabled"
              className="flex cursor-not-allowed items-center opacity-60"
            >
              {value}
            </span>
          </TooltipTrigger>
          <TooltipContent side="left">{DONE_HINT}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  } else {
    control = (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          type="button"
          disabled={pending}
          data-testid="blocked-control-trigger"
          aria-label={
            blocked
              ? 'Blocked. Edit the reason or unblock this issue'
              : 'Not blocked. Mark this issue as blocked'
          }
          className={cn(
            '-mr-1.5 flex h-7 shrink-0 items-center rounded-md px-1.5 transition-colors',
            pending
              ? 'cursor-not-allowed opacity-60'
              : 'hover:bg-ds-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-brand/40',
          )}
        >
          {value}
        </PopoverTrigger>

        <PopoverContent
          align="end"
          side="bottom"
          className="w-[292px] p-3"
          data-testid="blocked-control-popover"
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-foreground">
                Blocked reason
              </span>
              <span
                aria-hidden={!showCounter}
                className={cn(
                  'font-mono text-[10px] text-ds-text-muted',
                  showCounter ? '' : 'invisible',
                )}
              >
                {trimmed.length}/{BLOCKED_REASON_MAX}
              </span>
            </div>

            <p className="text-[11px] leading-[1.5] text-muted-foreground">
              {blocked
                ? 'Update or clear the reason this work cannot continue.'
                : 'Optional: a reason helps the team unblock you faster.'}
            </p>

            <textarea
              autoFocus
              rows={3}
              value={draft}
              maxLength={BLOCKED_REASON_MAX}
              aria-label="Blocked reason"
              data-testid="blocked-reason-input"
              placeholder="Why is this blocked?"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
                if (event.key === 'Escape') setOpen(false);
              }}
              className="w-full resize-none rounded-md border border-ds-border bg-ds-surface px-2 py-1.5 text-[12.5px] leading-[1.5] text-foreground placeholder:text-muted-foreground focus:border-ds-brand focus:outline-none"
            />

            <div className="flex items-center justify-end gap-1.5">
              {blocked ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-testid="blocked-control-unblock"
                  aria-busy={unblockState === 'loading'}
                  disabled={locked}
                  onClick={() => {
                    run(
                      () => onClear(),
                      setUnblockState,
                      () => setOpen(false),
                    );
                  }}
                  className="text-ds-danger hover:bg-ds-danger-soft hover:text-ds-danger"
                >
                  {/* Loader only, no copy. StatefulButton can't express this:
                      its label slot bails on a 0-width measurement, so an
                      empty label keeps its old width while the icon slot
                      expands and the button grows around the spinner. */}
                  {unblockState === 'loading' ? (
                    <Loader
                      variant="spinner"
                      size={14}
                      className="text-current"
                      label="Unblocking issue"
                    />
                  ) : (
                    'Unblock'
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={locked}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <StatefulButton
                type="button"
                size="sm"
                state={submitState}
                loadingText={blocked ? 'Saving' : 'Blocking'}
                successText={blocked ? 'Saved' : 'Blocked'}
                errorText="Try again"
                data-testid="blocked-control-submit"
                disabled={locked || (blocked && !reasonChanged)}
                onClick={submit}
                className="bg-ds-brand font-semibold text-white hover:bg-ds-brand/90"
              >
                {blocked ? 'Save reason' : 'Mark blocked'}
              </StatefulButton>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="flex flex-col gap-1" data-testid="blocked-control">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Blocked</span>
        {control}
      </div>
      {blocked && blockedReason ? (
        <p
          title={blockedReason}
          data-testid="blocked-reason"
          className="line-clamp-2 text-[11px] leading-[1.5] text-ds-text-muted"
        >
          {blockedReason}
        </p>
      ) : null}
    </div>
  );
}
