import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockSetTheme = vi.fn();
const mockGetSession = vi.fn();
const mockGetAppearance = vi.fn();

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: mockTheme.current, setTheme: mockSetTheme }),
}));

const mockTheme = { current: 'system' as string | undefined };

vi.mock('@/lib/auth-client', () => ({
  authClient: { getSession: (...args: unknown[]) => mockGetSession(...args) },
}));

vi.mock('@/lib/api/settings', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api/settings')>(
      '@/lib/api/settings',
    );
  return {
    ...actual,
    getAppearance: (...args: unknown[]) => mockGetAppearance(...args),
  };
});

import { ThemeSync } from '@/components/theme-sync';

function renderSync() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
    </QueryClientProvider>,
  );
}

/**
 * Precedence: the stored theme beats localStorage/next-themes, which beat the
 * default. next-themes owns the lower two; this is the part it cannot know.
 */
describe('ThemeSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme.current = 'system';
    mockGetSession.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockGetAppearance.mockResolvedValue({ theme: 'DARK' });
  });

  it('applies the stored theme over whatever next-themes had', async () => {
    renderSync();

    await waitFor(() => expect(mockSetTheme).toHaveBeenCalledWith('dark'));
  });

  it('leaves the applied theme alone when it already matches', async () => {
    mockGetAppearance.mockResolvedValue({ theme: 'SYSTEM' });
    mockTheme.current = 'system';

    renderSync();

    await waitFor(() => expect(mockGetAppearance).toHaveBeenCalled());
    expect(mockSetTheme).not.toHaveBeenCalled();
  });

  it('does not ask for a theme when nobody is signed in', async () => {
    mockGetSession.mockResolvedValue({ data: null });

    renderSync();

    // The endpoint is session-scoped, so a public page must not call it — and
    // the localStorage/default value simply stands.
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    expect(mockGetAppearance).not.toHaveBeenCalled();
    expect(mockSetTheme).not.toHaveBeenCalled();
  });
});
