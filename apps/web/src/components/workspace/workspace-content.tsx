import type { ReactNode } from 'react';

/**
 * Main content surface for a workspace: a white rounded card inset 6px from
 * the shell edges, matching the Main Content Surface in shipyard.pen
 * (fill #FFFFFF, cornerRadius 12, border #DEDCD5, padding 24).
 */
export function WorkspaceContent({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-0 flex-1 overflow-hidden p-1.5">
      <div className="h-full overflow-auto rounded-xl border border-ds-border bg-ds-surface p-6">
        {children}
      </div>
    </main>
  );
}
