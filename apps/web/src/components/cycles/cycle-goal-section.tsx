'use client';

import { Pencil } from 'lucide-react';
import { useState } from 'react';

/**
 * Cycle goal — the "Goal Section" from shipyard.pen
 * (Screen / Cycles - Detail, x69mRq): a GOAL label row with an edit affordance
 * on the right, then the goal body. Geometry and interaction match the issue
 * description field (issue-detail-page), which is the same editable block:
 * click the pencil, edit inline, Enter saves, Escape cancels, blur saves.
 *
 * Presentational — the parent owns the write and resolves to a boolean, so the
 * section never has to hold an error state of its own.
 *
 * `editable` is false for a completed or archived cycle: the API rejects a
 * PATCH on `COMPLETED` (`409 CYCLE_READ_ONLY`) and on archived
 * (`409 CYCLE_ARCHIVED`), so the affordance is hidden rather than left to fail.
 */
export function CycleGoalSection({
  goal,
  editable = true,
  onSave,
}: {
  goal: string | null;
  editable?: boolean;
  /** Persists the draft. A blank draft clears the goal (`null`). */
  onSave: (goal: string | null) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const save = () => {
    const next = draft.trim() === '' ? null : draft;
    if (next !== (goal ?? null)) void onSave(next);
    setEditing(false);
  };

  return (
    <div className="flex w-full flex-col gap-2.5">
      <div className="flex w-full items-center justify-between">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[1px] text-muted-foreground">
          Goal
        </span>
        {editable ? (
          <button
            type="button"
            aria-label={editing ? 'Stop editing goal' : 'Edit goal'}
            onClick={() => {
              setDraft(goal ?? '');
              setEditing((value) => !value);
            }}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-ds-bg hover:text-foreground"
          >
            <Pencil aria-hidden className="size-3.5" />
          </button>
        ) : null}
      </div>

      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              save();
            }
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={save}
          rows={4}
          placeholder="Add a goal…"
          className="w-full resize-none bg-transparent text-[13px] leading-[1.6] text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      ) : (
        <p className="whitespace-pre-wrap text-[13px] leading-[1.6] text-foreground">
          {goal ? (
            goal
          ) : (
            <span className="text-muted-foreground">No goal yet.</span>
          )}
        </p>
      )}
    </div>
  );
}
