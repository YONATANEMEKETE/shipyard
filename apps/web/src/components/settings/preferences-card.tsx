'use client';

import { useParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import type { ThemePreference, ViewScope, ViewType } from '@shipyard/shared';

import { SettingsCard } from '@/components/settings/settings-card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSetViewPreference, useViewPreference } from '@/hooks/use-projects';
import { useAppearance, useSetAppearance } from '@/hooks/use-settings';
import { cn } from '@/lib/utils';

/**
 * Preferences card (`.pen` `Xwmto` → `ehd4d`) — UI only.
 *
 * Geometry mirrors the frame: 1128×442 at 1440 wide, every child 18px apart in
 * a 24px-padded card, which reconciles exactly —
 *   24 + 14 + 18 + 18 + 18 + 16 + 18 + 35 + 18 + 127 + 18 + 38 + 18 + 38 + 24 = 442
 * (pad, eyebrow, gap, heading, gap, copy, gap, theme label block, gap,
 * previews, gap, issues row, gap, projects row, pad).
 *
 * Wired:
 *   - Theme → `GET`/`PUT /api/v1/settings/appearance` (F11 #3/#4), applied
 *     through next-themes so the change is visible before the write returns.
 *   - Views → F4's `GET`/`PUT /api/v1/workspaces/:slug/view-preferences/:scope`
 *     through the existing hooks, defaulting to LIST when no row exists.
 *
 * Note the conflict with the engineering design: api-design §9.3 routes the view
 * toggles to the owning issues/projects pages and says the shell never
 * reimplements them. The frame places them here anyway, so they are built here
 * against the same F4 endpoints — one cache entry, two consumers.
 *
 * The previews depict *other* themes, so they deliberately use literal colours
 * instead of tokens: a token resolves against the theme currently applied and
 * all three thumbnails would flip together, which is the one thing they must
 * not do. Chrome around them (card, labels, segmented control) uses tokens as
 * usual.
 */

const THEME_OPTIONS = [
  { value: 'LIGHT', label: 'Light' },
  { value: 'DARK', label: 'Dark' },
  { value: 'SYSTEM', label: 'System' },
] as const;

const VIEW_OPTIONS = [
  { value: 'LIST', label: 'List' },
  { value: 'KANBAN', label: 'Kanban' },
] as const;

/** Thumbnail halves and bars, exactly as the frame draws them. */
interface PreviewColours {
  surface: string;
  header: string;
  lineOne: string;
  lineTwo: string;
}

const PREVIEW_COLOURS: Record<'light' | 'dark', PreviewColours> = {
  light: {
    surface: '#FFFFFF',
    header: '#EEEDE8',
    lineOne: '#B9B5AC',
    lineTwo: '#DEDCD5',
  },
  dark: {
    surface: '#161512',
    header: '#332513',
    lineOne: '#6C6861',
    lineTwo: '#B9B5AC',
  },
};

function PreviewBars({ colours }: { colours: PreviewColours }) {
  return (
    <>
      <span
        className="h-3.5 w-full rounded"
        style={{ backgroundColor: colours.header }}
      />
      <span
        className="h-2 w-[110px] rounded"
        style={{ backgroundColor: colours.lineOne }}
      />
      <span
        className="h-2 w-[70px] rounded"
        style={{ backgroundColor: colours.lineTwo }}
      />
    </>
  );
}

function PreviewArt({ theme }: { theme: ThemePreference }) {
  if (theme === 'SYSTEM') {
    return (
      <>
        <span
          className="flex-1 rounded border"
          style={{
            backgroundColor: PREVIEW_COLOURS.light.surface,
            borderColor: PREVIEW_COLOURS.light.lineTwo,
          }}
        />
        <span
          className="flex-1 rounded"
          style={{ backgroundColor: PREVIEW_COLOURS.dark.surface }}
        />
      </>
    );
  }

  const colours = PREVIEW_COLOURS[theme === 'DARK' ? 'dark' : 'light'];

  return <PreviewBars colours={colours} />;
}

export function PreferencesCard() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  const { setTheme } = useTheme();
  const appearanceQuery = useAppearance();
  const setAppearance = useSetAppearance();

  // An absent row reads as SYSTEM (data-model D6), which is also what the API
  // answers, so the fallback here only covers the first paint.
  const theme = appearanceQuery.data?.theme ?? 'SYSTEM';

  const issuesPreference = useViewPreference(slug, 'ISSUE');
  const projectsPreference = useViewPreference(slug, 'PROJECT');
  const setViewPreference = useSetViewPreference(slug);

  const chooseTheme = (next: ThemePreference) => {
    // Apply first: the user should see the theme change while the write is in
    // flight, and next-themes mirrors it into localStorage for the next load.
    setTheme(next.toLowerCase());
    setAppearance.mutate({ theme: next });
  };

  const rows: {
    scope: ViewScope;
    label: string;
    sub: string;
    value: ViewType;
  }[] = [
    {
      scope: 'ISSUE',
      label: 'Default view for issues',
      sub: 'Shown on the issues page in this workspace.',
      value: issuesPreference.data?.view ?? 'LIST',
    },
    {
      scope: 'PROJECT',
      label: 'Default view for projects',
      sub: 'Shown on the projects page in this workspace.',
      value: projectsPreference.data?.view ?? 'LIST',
    },
  ];

  return (
    <SettingsCard eyebrow="Preferences" title="Preferences">
      <p className="text-[13px] leading-[1.5] text-muted-foreground">
        Choose how Shipyard looks and how your issue and project boards behave
        by default.
      </p>

      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold text-foreground">Theme</span>
        <span className="text-xs text-muted-foreground">
          Select between light, dark, or follow your system appearance.
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Theme"
        className="flex w-full flex-wrap gap-4"
      >
        {THEME_OPTIONS.map((option) => {
          const selected = option.value === theme;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => chooseTheme(option.value)}
              className="flex w-[200px] shrink-0 flex-col gap-2 text-left"
            >
              <span
                className={cn(
                  'flex h-[104px] gap-2 rounded-lg p-3 transition-colors',
                  option.value === 'SYSTEM' ? 'flex-row' : 'flex-col',
                  // 2px vs 1px border, not a size change: both are inside the
                  // box, so selecting a preview moves nothing.
                  selected
                    ? 'border-2 border-ds-brand'
                    : 'border border-ds-border-strong',
                )}
                style={
                  option.value === 'LIGHT'
                    ? { backgroundColor: PREVIEW_COLOURS.light.surface }
                    : option.value === 'DARK'
                      ? { backgroundColor: PREVIEW_COLOURS.dark.surface }
                      : undefined
                }
              >
                <PreviewArt theme={option.value} />
              </span>

              <span
                className={cn(
                  'text-xs',
                  selected
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>

      {rows.map((row) => (
        <div
          key={row.scope}
          className="flex w-full flex-wrap items-center gap-4"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[13px] font-semibold text-foreground">
              {row.label}
            </span>
            <span className="text-xs text-muted-foreground">{row.sub}</span>
          </div>

          <Tabs
            value={row.value}
            onValueChange={(details) =>
              setViewPreference.mutate({
                scope: row.scope,
                view: details.value as ViewType,
              })
            }
            className="shrink-0"
          >
            {/* The frame's track is #EEEDE8, which is the ds-sidebar token. */}
            <TabsList className="h-9.5 gap-1 rounded-lg bg-ds-sidebar p-1">
              {VIEW_OPTIONS.map((view) => (
                <TabsTrigger
                  key={view.value}
                  value={view.value}
                  className="h-[30px] rounded-md px-3.5"
                >
                  {view.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      ))}
    </SettingsCard>
  );
}
