import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockSetTheme = vi.fn();
const mockGetAppearance = vi.fn();
const mockSetAppearance = vi.fn();
const mockGetViewPreference = vi.fn();
const mockSetViewPreference = vi.fn();

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'system', setTheme: mockSetTheme }),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'harbor' }),
}));

vi.mock('@/lib/api/settings', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api/settings')>(
      '@/lib/api/settings',
    );
  return {
    ...actual,
    getAppearance: (...args: unknown[]) => mockGetAppearance(...args),
    setAppearance: (...args: unknown[]) => mockSetAppearance(...args),
  };
});

vi.mock('@/lib/api/projects', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api/projects')>(
      '@/lib/api/projects',
    );
  return {
    ...actual,
    getViewPreference: (...args: unknown[]) => mockGetViewPreference(...args),
    setViewPreference: (...args: unknown[]) => mockSetViewPreference(...args),
  };
});

import { PreferencesCard } from '@/components/settings/preferences-card';
import { ToastProvider } from '@/components/providers/toast-provider';

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <PreferencesCard />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** The nth segment with this label — there are two rows of List/Kanban. */
function segment(name: string, index: number): HTMLElement {
  const found = screen.getAllByRole('tab', { name })[index];
  if (!found) throw new Error(`no ${name} segment at ${index}`);
  return found;
}

describe('PreferencesCard — wired behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAppearance.mockResolvedValue({ theme: 'DARK' });
    mockSetAppearance.mockResolvedValue({ theme: 'LIGHT' });
    mockGetViewPreference.mockImplementation((_slug: string, scope: string) =>
      Promise.resolve({ view: scope === 'PROJECT' ? 'KANBAN' : 'LIST' }),
    );
    mockSetViewPreference.mockImplementation(
      (_slug: string, scope: string, view: string) =>
        Promise.resolve({ scope, view }),
    );
  });

  it('starts from the stored theme and the stored view preferences', async () => {
    renderCard();

    // DARK from the API, not the SYSTEM default. waitFor, not findByRole: the
    // radios exist from the first paint, so only the checked state waits.
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
    expect(screen.getByRole('radio', { name: 'System' })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    // One row each, read per scope.
    expect(mockGetViewPreference).toHaveBeenCalledWith('harbor', 'ISSUE');
    expect(mockGetViewPreference).toHaveBeenCalledWith('harbor', 'PROJECT');
    await waitFor(() =>
      expect(screen.getAllByRole('tab', { name: 'Kanban' })[1]).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
    expect(screen.getAllByRole('tab', { name: 'List' })[0]).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('applies the theme immediately and persists it', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('radio', { name: 'Light' }));

    // Applied before the write resolves: the point is that the user sees it.
    expect(mockSetTheme).toHaveBeenCalledWith('light');
    // TanStack passes its context as a second argument to mutationFn.
    expect(mockSetAppearance).toHaveBeenCalledWith(
      { theme: 'LIGHT' },
      expect.anything(),
    );

    // And the selection follows the confirmed value.
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
  });

  it('writes each view preference under its own scope', async () => {
    const user = userEvent.setup();
    renderCard();

    await screen.findByRole('radio', { name: 'Dark' });
    await user.click(segment('Kanban', 0));

    expect(mockSetViewPreference).toHaveBeenCalledWith(
      'harbor',
      'ISSUE',
      'KANBAN',
    );

    await user.click(segment('List', 1));
    expect(mockSetViewPreference).toHaveBeenCalledWith(
      'harbor',
      'PROJECT',
      'LIST',
    );
  });

  it('falls back to SYSTEM and LIST when nothing has been stored', async () => {
    // The API answers SYSTEM for an absent row (D6) and LIST for an absent
    // preference, so the client never invents a default of its own.
    mockGetAppearance.mockResolvedValue({ theme: 'SYSTEM' });
    mockGetViewPreference.mockResolvedValue({ view: 'LIST' });

    renderCard();

    expect(
      await screen.findByRole('radio', { name: 'System' }),
    ).toHaveAttribute('aria-checked', 'true');
    await waitFor(() =>
      expect(screen.getAllByRole('tab', { name: 'List' })).toHaveLength(2),
    );
    for (const tab of screen.getAllByRole('tab', { name: 'List' })) {
      expect(tab).toHaveAttribute('aria-selected', 'true');
    }
  });
});
