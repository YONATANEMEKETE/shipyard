import type { ReactNode } from 'react';

/**
 * Main content surface for a workspace: a white rounded card inset 6px from
 * the shell edges, matching the Main Content Surface in shipyard.pen
 * (fill #FFFFFF, cornerRadius 12, border #DEDCD5, padding 24).
 */
export function WorkspaceContent({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-0 flex-1 overflow-hidden p-1.5">
      {/*
       * The shell never scrolls sideways. Every surface that legitimately
       * needs a horizontal scroll owns one (the kanban board, the member
       * tables); anything else that overflows is a layout bug, and an
       * `overflow-auto` here turned it into a page-wide blank scroll area
       * with hidden scrollbars, which reads as the app sliding into empty
       * space. Clipping keeps the failure local and visible.
       */}
      <div className="h-full overflow-x-hidden overflow-y-auto rounded-xl border border-ds-border bg-ds-surface p-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </main>
  );
}
