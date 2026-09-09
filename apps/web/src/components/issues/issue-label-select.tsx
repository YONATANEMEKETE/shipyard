'use client';

import { Check, Plus, Search, Tag } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectTrigger,
} from '@/components/motion/select';
import { cn } from '@/lib/utils';
import type { LabelCard } from '@shipyard/shared';

export type IssueLabelSelectVariant = 'rail' | 'pill' | 'plus';

export interface IssueLabelSelectProps {
  /** All workspace labels — from useLabels(). When empty, the trigger is disabled (mirrors Project/Cycle). */
  labels: LabelCard[];
  /** Currently attached label ids on this issue (issue.labels.map(l=>l.id)). */
  selectedIds: string[];
  /** Toggle a label — parent should call attach/detach. Dropdown stays open for multi-select. */
  onToggle: (labelId: string) => void;
  /** Disable whole control (e.g. while updateIssue.isPending). Empty workspace also disables when not loading. */
  disabled?: boolean;
  /** While labels are loading, don't treat empty as "no labels" — avoids disabled flash. */
  isLoading?: boolean;
  /** Optional placeholder when nothing selected. Defaults to "No labels" (rail) / "Labels" (pill). */
  placeholder?: string;
  /** Visual variant: rail = right-panel transparent, pill = create-dialog rounded-full pill. Default rail. */
  variant?: IssueLabelSelectVariant;
  /** Validation — pill variant shows destructive border when invalid. */
  invalid?: boolean;
  /** Extra class for the trigger wrapper. */
  className?: string;
  /** Bubble open state to parent (e.g. create dialog's panelVisible overflow fix). */
  onOpenChange?: (open: boolean) => void;
  /** Where to align the dropdown content. Default end for rail, start for pill. */
  align?: 'start' | 'end';
}

/**
 * LabelSelectorDropdown — static/controlled variant per Pencil frame KMoed.
 * Context: Multi-select label picker. Anchors below the Labels Row, right-aligned to properties rail.
 * Toggles apply instantly; search filters the list. Stays open for multi-select (Select stays open — options are plain buttons, not SelectItem).
 *
 * Spec from shipyard.pen KMoed (300×, ds-surface, 12r, ds-border, shadow 0/8/24 #00000029):
 * - Search wrap px 12/12/8/12 → inner Search field h-8 fill transparent border-b ds-border gap 8 px 10 + Search icon 13 muted + "Search labels…" 12 muted.
 * - Label list vertical gap 2 p 4/8 → each option fill transparent 8r gap 8 p 6/8 → checkbox 16 4r (brand when checked, border ds-border when unchecked) + 8 dot + label text 12 500 ds-text.
 */
export function IssueLabelSelect({
  labels,
  selectedIds,
  onToggle,
  disabled,
  isLoading,
  placeholder,
  variant = 'rail',
  invalid,
  className,
  onOpenChange,
  align,
}: IssueLabelSelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const hasLabels = labels.length > 0;
  const shouldDisableEmpty = !isLoading && !hasLabels;
  const isDisabled = disabled || shouldDisableEmpty;
  const effectivePlaceholder =
    placeholder ?? (variant === 'pill' ? 'Labels' : 'No labels');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return labels;
    return labels.filter((l) => l.name.toLowerCase().includes(q));
  }, [labels, query]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const triggerContent = (() => {
    if (variant === 'pill') {
      if (!hasLabels)
        return (
          <span className="truncate text-muted-foreground">
            {effectivePlaceholder}
          </span>
        );
      if (selectedIds.length === 0)
        return (
          <span className="truncate text-muted-foreground">
            {effectivePlaceholder}
          </span>
        );
      const selectedLabels = labels.filter((l) => selectedSet.has(l.id));
      if (selectedLabels.length === 0)
        return (
          <span className="truncate text-muted-foreground">
            {effectivePlaceholder}
          </span>
        );
      const labelText = selectedLabels.map((l) => l.name).join(', ');
      return (
        <span className="max-w-[120px] truncate text-foreground">
          {labelText}
        </span>
      );
    }
    if (!hasLabels)
      return (
        <span className="truncate text-muted-foreground">
          {effectivePlaceholder}
        </span>
      );
    if (selectedIds.length === 0)
      return (
        <span className="truncate text-foreground">{effectivePlaceholder}</span>
      );
    const selectedLabels = labels.filter((l) => selectedSet.has(l.id));
    if (selectedLabels.length === 0)
      return <span className="truncate">{effectivePlaceholder}</span>;
    return (
      <span className="flex max-w-[160px] flex-wrap justify-end gap-1.5">
        {selectedLabels.slice(0, 3).map((l) => (
          <span
            key={l.id}
            className="inline-flex h-5 items-center gap-1 rounded-full bg-ds-surface-subtle px-2 text-[10px] font-medium text-foreground"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: l.color }}
              aria-hidden
            />
            <span className="max-w-[80px] truncate">{l.name}</span>
          </span>
        ))}
        {selectedLabels.length > 3 ? (
          <span className="inline-flex h-5 items-center rounded-full bg-ds-surface-subtle px-2 text-[10px] font-medium text-muted-foreground">
            +{selectedLabels.length - 3}
          </span>
        ) : null}
      </span>
    );
  })();

  const contentAlignClass =
    align !== undefined
      ? align === 'start'
        ? '!left-0 !right-auto'
        : '!left-auto !right-0'
      : variant === 'pill'
        ? '!left-0 !right-auto'
        : '!left-auto !right-0';

  const triggerClasses =
    variant === 'pill'
      ? cn(
          'inline-flex h-7 max-w-[180px] shrink-0 items-center gap-1.5 rounded-full border bg-ds-surface-subtle px-3 text-xs font-medium transition-colors hover:border-ds-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&>span:last-child]:hidden',
          invalid ? 'border-destructive' : 'border-ds-border',
          selectedIds.length === 0
            ? 'text-muted-foreground'
            : 'text-foreground',
        )
      : variant === 'plus'
        ? '!flex !size-5 !h-5 !w-5 shrink-0 !items-center !justify-center !rounded-md !border !border-ds-border !bg-ds-surface !p-0 text-ds-text-muted transition-colors hover:!border-ds-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&>span:last-child]:hidden data-[disabled]:opacity-50 !gap-0'
        : 'h-auto w-auto max-w-[180px] justify-end gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-foreground shadow-none hover:bg-transparent focus-visible:ring-0 data-[disabled]:opacity-50';

  return (
    <Select
      open={open}
      onOpenChange={handleOpenChange}
      disabled={isDisabled}
      className={className}
    >
      <SelectTrigger
        className={triggerClasses}
        aria-label={variant === 'plus' ? 'Add label' : undefined}
      >
        {variant === 'pill' ? (
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <Tag
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            {triggerContent}
          </span>
        ) : variant === 'plus' ? (
          <Plus className="size-3 shrink-0" aria-hidden />
        ) : (
          <span className="flex min-w-0 items-center justify-end gap-1.5 truncate">
            {triggerContent}
          </span>
        )}
      </SelectTrigger>

      <SelectContent
        className={cn(
          'w-[300px] rounded-xl border-ds-border bg-ds-surface p-0 shadow-[0_8px_24px_#00000029]',
          contentAlignClass,
        )}
      >
        <div className="flex flex-col">
          {/* Search wrap: p 12 12 8 12 per spec */}
          <div className="px-3 pb-2 pt-3">
            {/* Search field: h-8 fill transparent border-b ds-border gap 8 px 2.5 (=10) */}
            <div className="flex h-8 w-full items-center gap-2 border-b border-ds-border px-2.5">
              <Search
                className="size-[13px] shrink-0 text-ds-text-muted"
                aria-hidden
              />
              <input
                autoFocus={open}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Don't let typing Escape bubble to Select's global Escape handler until user clears
                  if (e.key === 'Escape' && query) {
                    e.stopPropagation();
                    setQuery('');
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder="Search labels…"
                className="h-full w-full bg-transparent text-xs font-normal text-foreground placeholder:text-ds-text-muted focus:outline-none"
                aria-label="Search labels"
              />
            </div>
          </div>

          {/* Label list: vertical gap 2 p 4/8, scroll when tall */}
          <div className="flex max-h-[240px] flex-col gap-0.5 overflow-y-auto px-2 pb-2 pt-1">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 px-3 py-8 text-center">
                <p className="text-xs font-medium text-foreground">
                  {query ? 'No labels found' : 'No labels'}
                </p>
                <p className="max-w-[220px] text-[11px] leading-relaxed text-muted-foreground">
                  {query
                    ? `No labels match “${query}”.`
                    : 'Create labels in workspace settings to organize issues.'}
                </p>
              </div>
            ) : (
              filtered.map((label) => {
                const checked = selectedSet.has(label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => onToggle(label.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none transition-colors',
                      checked
                        ? 'bg-ds-surface-subtle text-foreground'
                        : 'text-foreground hover:bg-ds-surface-subtle focus-visible:bg-ds-surface-subtle',
                    )}
                  >
                    {/* Checkbox 16 4r — brand fill when checked per spec, ds-border when unchecked */}
                    <span
                      className={cn(
                        'grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors',
                        checked
                          ? 'border-ds-brand bg-ds-brand text-white'
                          : 'border-ds-border bg-transparent text-transparent',
                      )}
                      aria-hidden
                    >
                      <Check
                        className={cn(
                          'size-[11px]',
                          checked ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    </span>
                    {/* Dot 8 per spec */}
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: label.color }}
                      aria-hidden
                    />
                    {/* Label text 12 500 ds-text */}
                    <span className="flex-1 truncate text-xs font-medium text-foreground">
                      {label.name}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </SelectContent>
    </Select>
  );
}

/**
 * Static preview — drop-in for visual QA without wiring. Mirrors KMoed with bug/frontend checked.
 * Use in issue-detail-page stories or throwaway preview route.
 */
export function IssueLabelSelectStatic() {
  const [selected, setSelected] = useState<string[]>(['1', '2']);
  const mockLabels: LabelCard[] = [
    { id: '1', workspaceId: 'w1', name: 'bug', color: '#E5484D' },
    { id: '2', workspaceId: 'w1', name: 'frontend', color: '#0091FF' },
    { id: '3', workspaceId: 'w1', name: 'backend', color: '#B45309' },
    { id: '4', workspaceId: 'w1', name: 'design', color: '#30A46C' },
  ];
  return (
    <div className="flex w-[320px] flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Labels</span>
        <IssueLabelSelect
          labels={mockLabels}
          selectedIds={selected}
          onToggle={(id) =>
            setSelected((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
            )
          }
        />
      </div>
      <div className="rounded-lg border border-dashed border-ds-border p-3 text-[11px] text-muted-foreground">
        Static demo — checked: {selected.join(', ') || 'none'}. Search filters
        below. Disabled when labels=[] (try passing empty).
      </div>
    </div>
  );
}
