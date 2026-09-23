import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetSession = vi.fn();
const mockIdentify = vi.fn();
const mockReset = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: { getSession: (...args: unknown[]) => mockGetSession(...args) },
}));

vi.mock('@/lib/posthog', () => ({
  identifyAnalyticsUser: (...args: unknown[]) => mockIdentify(...args),
  resetAnalytics: (...args: unknown[]) => mockReset(...args),
}));

import { AnalyticsIdentity } from '@/components/analytics/analytics-identity';

function renderIdentity() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AnalyticsIdentity />
    </QueryClientProvider>,
  );
}

/**
 * The identity island is the only thing tying an anonymous browser to a person.
 * It must identify exactly the signed-in user, reset only once it knows nobody
 * is signed in, and never touch the id while the session is still loading.
 */
describe('AnalyticsIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { user: { id: 'user_1' } } });
  });

  it('identifies the signed-in user by id', async () => {
    renderIdentity();

    await waitFor(() => expect(mockIdentify).toHaveBeenCalledWith('user_1'));
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('resets once the session answers with nobody signed in', async () => {
    mockGetSession.mockResolvedValue({ data: null });

    renderIdentity();

    await waitFor(() => expect(mockReset).toHaveBeenCalled());
    expect(mockIdentify).not.toHaveBeenCalled();
  });

  it('does nothing while the session is still loading', async () => {
    mockGetSession.mockReturnValue(new Promise(() => {}));

    renderIdentity();

    // A reset here would rotate the id of a person who is in fact signed in.
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    expect(mockIdentify).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();
  });
});
