'use client';

import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Shared date picker — react-day-picker `Calendar` shown in a `Popover`,
 * triggered by a calendar-icon button. Values are serialized to the shared
 * `YYYY-MM-DD` format used across the project contracts (create/edit dialogs,
 * toolbar date filters). Mirrors Start/Target date inputs in shipyard.pen.
 */

export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DatePickerField({
  value,
  onChange,
  placeholder,
  error,
}: {
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected: Date | undefined = value
    ? new Date(`${value}T12:00:00`)
    : undefined;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-md border bg-ds-surface px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              error ? 'border-destructive' : 'border-ds-border',
              !value && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">
              {value
                ? format(new Date(`${value}T12:00:00`), 'MMM d, yyyy')
                : (placeholder ?? 'Pick a date')}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="w-auto border-ds-border bg-ds-surface p-0 shadow-xl"
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              onChange(date ? toYmd(date) : undefined);
              setOpen(false);
            }}
            fixedWeeks
            initialFocus
          />
          <div className="flex items-center justify-between border-t border-ds-border p-2">
            <span className="pl-2 text-xs text-muted-foreground">
              {value
                ? format(new Date(`${value}T12:00:00`), 'EEEE, MMMM d, yyyy')
                : 'No date selected'}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {error ? (
        <p className="mt-1.5 text-xs text-destructive">{error}</p>
      ) : null}
    </>
  );
}
