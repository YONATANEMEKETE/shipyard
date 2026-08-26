import type { ReactNode } from 'react';
import { AuthVisualStoryPanel } from '@/components/auth/auth-visual-story-panel';

/**
 * Layout for the public auth flow (`/sign-in`, `/sign-up`, `/forgot-password`,
 * `/reset-password`, `/verify-email`, `/error`).
 *
 * The visual story panel takes ~40% of the viewport (capped at 720px) on
 * the left, the form column takes the remaining space on the right. The
 * shell is a definite full-viewport height so the panel's h-full fills
 * edge to edge vertically; the outer padding keeps the rounded card off
 * the viewport edges.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh gap-4 overflow-hidden bg-ds-bg p-2 md:gap-4 md:p-3">
      <AuthVisualStoryPanel />

      <main className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-10">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
    </div>
  );
}
