'use client';
// beui.dev/components/blocks/bloom-menu

import {
  Bell,
  FileText,
  FolderClosed,
  LayoutGrid,
  Link,
  Plus,
  Table,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { type ComponentType, useEffect, useId, useRef, useState } from 'react';
import { EASE_OUT } from '@/lib/ease';
import { cn } from '@/lib/utils';

type MenuItem = { label: string; icon: ComponentType<{ className?: string }> };

const ITEMS: MenuItem[] = [
  { label: 'Doc', icon: FileText },
  { label: 'Board', icon: LayoutGrid },
  { label: 'Table', icon: Table },
  { label: 'Folder', icon: FolderClosed },
  { label: 'Reminder', icon: Bell },
  { label: 'Link', icon: Link },
];

// Folder-open feel: a touch of overshoot as the panel expands, kept subtle.
const SPRING_FOLDER = {
  type: 'spring',
  stiffness: 300,
  damping: 32,
  mass: 0.9,
} as const;

export interface BloomMenuProps {
  items?: MenuItem[];
  onSelect?: (label: string) => void;
  /** Where the panel opens relative to the trigger. Default: "center". */
  placement?: 'center' | 'bottom-end';
  className?: string;
  disabled?: boolean;
}

export function BloomMenu({
  items = ITEMS,
  onSelect,
  placement = 'center',
  className,
  disabled = false,
}: BloomMenuProps) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const layoutId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const morph = reduce ? { duration: 0.15 } : SPRING_FOLDER;

  // Square-ish grid: 2x2 for four items, 3-wide otherwise.
  const cols = items.length === 4 ? 2 : 3;
  const rows = Math.ceil(items.length / cols);

  return (
    <div ref={ref} className={cn('relative inline-flex', className)}>
      {/* spacer fixes the anchor to the trigger size */}
      <div className="h-9 w-28" aria-hidden />

      {/* Anchor box sized to the OPEN panel. While closed it is centered on the
          trigger so the trigger renders exactly over its spacer. "bottom-end"
          only re-anchors once open — the trigger is unmounted by then, and the
          layoutId morph carries the button rect into the panel rect below it.
          The box is a fixed size per viewport (vw doesn't change mid-animation),
          so its translate centering never drifts the way a content-sized wrapper
          would. */}
      <div
        className={cn(
          'pointer-events-none absolute z-30 grid h-[300px] w-[min(86vw,420px)] [&>*]:pointer-events-auto',
          placement === 'center' || !open
            ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 place-items-center'
            : 'right-0 top-0 place-items-start',
        )}
      >
        {/* popLayout pulls the exiting trigger out of grid flow at once, so the
            grid never briefly holds two rows and shoves the panel off-center */}
        <AnimatePresence initial={false} mode="popLayout">
          {open ? (
            <motion.div
              key="panel"
              layoutId={layoutId}
              transition={morph}
              style={{ borderRadius: 16 }}
              className="w-[min(86vw,420px)] overflow-hidden border border-border bg-card"
            >
              <motion.div
                // `layout` lets framer undo the box's morph scaling so this
                // content stays crisp instead of stretching with the resize.
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduce ? 0 : 0.12, duration: 0.2 }}
              >
                {/* header */}
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    Create
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close menu"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* grid */}
                <motion.div
                  // Iris reveal: start as a small box at the grid center and open
                  // outward to all four corners, so the menu grows from the middle
                  // in every direction instead of wiping top-down.
                  initial={
                    reduce ? false : { clipPath: 'inset(45% 34% 45% 34%)' }
                  }
                  animate={{ clipPath: 'inset(0% 0% 0% 0%)' }}
                  transition={{
                    delay: reduce ? 0 : 0.08,
                    duration: 0.45,
                    ease: EASE_OUT,
                  }}
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  }}
                >
                  {items.map((item, i) => {
                    // Radial stagger: delay each item by its distance from the
                    // grid center so the corners animate together and the
                    // open reads as center-out, not corner-by-corner.
                    const row = Math.floor(i / cols);
                    const col = i % cols;
                    const dist = Math.hypot(
                      col - (cols - 1) / 2,
                      row - (rows - 1) / 2,
                    );
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          onSelect?.(item.label);
                          setOpen(false);
                        }}
                        // Static cell with hairline borders (no animated fill) so
                        // the grid lines never flicker as items stagger in. Only the
                        // inner content animates.
                        className={cn(
                          'flex cursor-pointer items-center justify-center px-3 py-6 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground',
                          i % cols !== cols - 1 && 'border-r border-border',
                          i < cols && 'border-b border-border',
                        )}
                      >
                        <motion.span
                          initial={
                            reduce
                              ? { opacity: 0 }
                              : { opacity: 0, scale: 0.85, filter: 'blur(6px)' }
                          }
                          animate={{
                            opacity: 1,
                            scale: 1,
                            filter: 'blur(0px)',
                          }}
                          transition={{
                            delay: reduce ? 0 : 0.1 + dist * 0.07,
                            type: 'spring',
                            stiffness: 440,
                            damping: 34,
                          }}
                          className="flex flex-col items-center gap-2"
                        >
                          <item.icon className="h-5 w-5" />
                          <span className="text-sm font-medium">
                            {item.label}
                          </span>
                        </motion.span>
                      </button>
                    );
                  })}
                </motion.div>
              </motion.div>
            </motion.div>
          ) : (
            <motion.button
              key="trigger"
              type="button"
              layoutId={layoutId}
              transition={morph}
              style={{ borderRadius: 8 }}
              onClick={() => setOpen(true)}
              disabled={disabled}
              aria-haspopup="menu"
              aria-expanded={open}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              className={cn(
                'inline-flex h-9 w-28 cursor-pointer items-center justify-center rounded-lg bg-ds-brand text-xs font-semibold text-white transition-colors hover:bg-ds-brand/90',
                disabled &&
                  'cursor-not-allowed bg-ds-surface-subtle text-muted-foreground opacity-60 hover:bg-ds-surface-subtle',
              )}
            >
              {/* own `layout` counter-scales the label so it stays crisp while the
                  button box morphs, instead of stretching with it */}
              <motion.span
                layout
                className="inline-flex items-center gap-2 whitespace-nowrap"
              >
                Create
                <Plus className="h-4 w-4" />
              </motion.span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
