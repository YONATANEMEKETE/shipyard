'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Section chrome for the dashboard rail's three list sections — My Work,
 * Active Projects, and Recent Activity.
 *
 * The rail's Current Cycle card is the odd one out: it owns a bordered panel
 * with a badge in its header, so it doesn't use these. These three are heading
 * rows on the hub surface itself, each a mono label against a "View all" link
 * (the dashboard frame has all three at `fill_container` + `space_between`).
 */

export function RailSectionHeader({
  label,
  action,
}: {
  label: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-ds-text-muted">
        {label}
      </span>
      {action}
    </div>
  );
}

/**
 * The rail's trailing "View all …" link. The arrow nudges 2px on hover — the
 * link is a small target, so the arrow carries the affordance. Dropped under
 * reduced motion.
 */
export function ViewAllLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ds-brand transition-colors hover:text-ds-brand/80"
    >
      {label}
      <ArrowRight
        aria-hidden
        className="size-[13px] transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  );
}
