'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';

import { useAppearance } from '@/hooks/use-settings';
import { useSession } from '@/hooks/use-session';

/**
 * Applies the signed-in user's stored theme.
 *
 * Precedence, highest first:
 *   1. the database (`GET /api/v1/settings/appearance`)
 *   2. localStorage — whatever next-themes already applied
 *   3. the default, SYSTEM
 *
 * next-themes covers 2 and 3 on its own, but it cannot know about 1; it has no
 * server source and its whole model is the client cache. So the database value
 * is applied on top of it. Nothing is written back by hand — `setTheme` makes
 * next-themes mirror the value into localStorage, so the next load starts from
 * the stored theme (no flash) and a signed-out visitor still gets whatever they
 * last chose.
 *
 * The read is gated on a session: `/settings/appearance` is session-scoped, so
 * asking from a public page would only ever produce a 401.
 *
 * **The database seeds the theme; it is not an ongoing authority.** Every change
 * the user makes is written back (see `useSetAppearance`), so re-applying a
 * stored value we have already honoured is wrong — and was the theme-switch
 * flicker. A toggle updates `theme` immediately while the query cache still
 * holds the previous value for a beat, so this effect used to pair the two,
 * "correct" the user back, then flip forward again when the write landed:
 * light → dark → light → dark.
 *
 * `lastApplied` therefore records the last *stored* value we acted on, not the
 * live theme. A cache entry we have already seen is ignored (no revert while a
 * write is in flight), and a genuinely new one — first load, a refetch after an
 * account switch — still applies. Transient staleness costs nothing, since the
 * only thing that can change the stored value is this client writing it.
 */
export function ThemeSync() {
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const { data: appearance } = useAppearance({
    enabled: Boolean(session?.user),
  });

  const lastApplied = useRef<string | null>(null);

  useEffect(() => {
    if (!appearance) return;

    // next-themes works in lowercase; the API stores the enum.
    const stored = appearance.theme.toLowerCase();
    if (lastApplied.current === stored) return;
    lastApplied.current = stored;

    if (theme !== stored) setTheme(stored);
  }, [appearance, theme, setTheme]);

  return null;
}
