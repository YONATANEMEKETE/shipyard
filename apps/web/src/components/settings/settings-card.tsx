/**
 * The settings card shell — one definition for all three cards.
 *
 * `.pen` `Xwmto` draws every card identically: #FFFFFF on a #B9B5AC border at
 * radius 12, 24px padding, and **18px between every direct child** (which is
 * what makes each card's height reconcile exactly against its frame). The
 * eyebrow is Geist Mono 11/700/+1 tracking, the title 15/650.
 *
 * Extracted so a fourth card cannot quietly drift to 16px gaps.
 */

import type { ReactNode } from 'react';

export function SettingsCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex w-full flex-col gap-[18px] rounded-xl border border-ds-border-strong bg-ds-surface p-6">
      <span className="font-mono text-[11px] font-bold uppercase tracking-[1px] text-muted-foreground">
        {eyebrow}
      </span>

      <h2 className="text-[15px] font-semibold leading-none tracking-[-0.2px] text-foreground">
        {title}
      </h2>

      {children}
    </section>
  );
}
