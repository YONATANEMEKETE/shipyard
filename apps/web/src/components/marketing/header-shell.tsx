'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * The sticky shell around the header's markup.
 *
 * It owns the two things the server-rendered bar cannot: where it sits while the
 * page moves, and whether it draws its own bottom rule. At rest it draws none —
 * the line under the bar belongs to the hero's top border, which is what lets the
 * hero's corner marks cross that border. Once the page has scrolled even a few
 * pixels, the hero's border has travelled up out from under the bar, so the bar
 * supplies its own line instead of letting content pass under it unannounced.
 *
 * The children stay server-rendered: only this wrapper ships script.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const sync = () => {
      const scrolled = window.scrollY > 8;

      setIsScrolled(scrolled);
      // Published on the root element because one thing outside this subtree
      // needs it: the hero's corner marks sit above the bar while the page is at
      // rest (they cross the hero's own top border) and must fall behind it once
      // the bar draws its line. CSS reads this, so the marks stay server-rendered.
      document.documentElement.dataset.scrolled = String(scrolled);
    };

    sync();
    window.addEventListener('scroll', sync, { passive: true });

    return () => {
      window.removeEventListener('scroll', sync);
      delete document.documentElement.dataset.scrolled;
    };
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 bg-ds-bg/85 backdrop-blur-sm',
        isScrolled && 'border-b border-ds-border',
      )}
    >
      {children}
    </header>
  );
}
