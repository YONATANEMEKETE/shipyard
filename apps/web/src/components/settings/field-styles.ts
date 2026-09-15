/**
 * Shared control geometry for the settings cards.
 *
 * One definition so the profile card and its rows can never drift: 36px tall,
 * 8px radius, 12px label — the frame's control height (.pen DS 03, `MD Control
 * Row`).
 */

export const CONTROL_CLASS =
  'h-9 gap-2 rounded-lg px-3.5 text-xs font-semibold';

export const FIELD_CLASS_NAMES = {
  label: 'px-1 text-[11px] font-semibold',
  field: 'rounded-lg border-ds-border',
  input: 'text-xs',
} as const;
