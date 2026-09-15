'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';

import { useAppearance } from '@/hooks/use-settings';
import { useSession } from '@/hooks/use-session';

/**
 * Applies the signed-in user's stored theme, which is the authority.
 *
 * Precedence, highest first:
 *   1. the database (`GET /api/v1/settings/appearance`)
 *   2. localStorage — whatever next-themes already applied
 *   3. the default, SYSTEM
 *
 * next-themes covers 2 and 3 on its own, but it cannot know about 1; it has no
 * server source and its whole model is the client cache. So the database value
 * is applied on top whenever it arrives. Nothing is written back by hand —
 * `setTheme` makes next-themes mirror the value into localStorage, so the next
 * load starts from the stored theme (no flash) and a signed-out visitor still
 * gets whatever they last chose.
 *
 * The read is gated on a session: `/settings/appearance` is session-scoped, so
 * asking from a public page would only ever produce a 401.
 */
export function ThemeSync() {
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const { data: appearance } = useAppearance({
    enabled: Boolean(session?.user),
  });

  useEffect(() => {
    if (!appearance) return;

    // next-themes works in lowercase; the API stores the enum.
    const stored = appearance.theme.toLowerCase();
    if (theme !== stored) setTheme(stored);
  }, [appearance, theme, setTheme]);

  return null;
}
