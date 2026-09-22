import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockVerifyEmail = vi.fn();
const mockGetSession = vi.fn();
const mockReplace = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    verifyEmail: (...args: unknown[]) => mockVerifyEmail(...args),
    getSession: (...args: unknown[]) => mockGetSession(...args),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
}));

import { VerifyEmailFlow } from '@/components/auth/verify-email-flow';

/**
 * The flow invalidates cached queries on success (a change-email
 * verification rewrites the user row), so it needs a real client. Each render
 * gets a fresh one, and it is returned so tests can spy on invalidations.
 */
function renderFlow(props: { token?: string; next?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <VerifyEmailFlow {...props} />
    </QueryClientProvider>,
  );

  return { ...result, queryClient };
}

describe('VerifyEmailFlow — user behaviour (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockVerifyEmail.mockResolvedValue({ error: null });
    // Default: verification succeeded, so the session probe finds a session.
    mockGetSession.mockResolvedValue({ data: { session: { id: 's1' } } });
  });

  it('shows invalid link when no token provided and does not call API', () => {
    renderFlow();

    expect(
      screen.getByRole('heading', { name: /this link isn.*t valid/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/missing, invalid, or has already been used/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /go to sign in/i }),
    ).toHaveAttribute('href', '/sign-in');
    expect(mockVerifyEmail).not.toHaveBeenCalled();
  });

  it('shows invalid link for empty string token', () => {
    renderFlow({ token: '' });

    expect(
      screen.getByRole('heading', { name: /this link isn.*t valid/i }),
    ).toBeInTheDocument();
    expect(mockVerifyEmail).not.toHaveBeenCalled();
  });

  it('shows verifying state initially when token provided', () => {
    mockVerifyEmail.mockReturnValue(new Promise(() => {}));

    renderFlow({ token: 'tok_123' });

    expect(
      screen.getByRole('heading', { name: /verifying your email/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/one moment while we confirm/i),
    ).toBeInTheDocument();
    expect(mockVerifyEmail).toHaveBeenCalledWith({
      query: {
        token: 'tok_123',
        callbackURL: `${window.location.origin}/w`,
      },
    });
  });

  it('shows success after verification and auto-redirects after 1.4s', async () => {
    mockVerifyEmail.mockResolvedValue({ error: null });

    renderFlow({ token: 'tok_success' });

    expect(
      await screen.findByRole('heading', {
        name: /email verified successfully/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/signing you in/i)).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/w'), {
      timeout: 2000,
    });
  });

  it('shows error when verification fails and no session exists', async () => {
    mockVerifyEmail.mockResolvedValue({ error: { message: 'invalid' } });
    mockGetSession.mockResolvedValue({ data: null });

    renderFlow({ token: 'tok_bad' });

    expect(
      await screen.findByRole('heading', {
        name: /we couldn.*t verify your email/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/this link may have expired/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /back to sign in/i }),
    ).toHaveAttribute('href', '/sign-in');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('treats a transport error as success when the session exists', async () => {
    // Cross-origin follow-through of the verify redirect can reject even
    // though the API verified the token and set the session cookie.
    mockVerifyEmail.mockRejectedValue(new TypeError('Failed to fetch'));
    mockGetSession.mockResolvedValue({ data: { session: { id: 's1' } } });

    renderFlow({ token: 'tok_transport' });

    expect(
      await screen.findByRole('heading', {
        name: /email verified successfully/i,
      }),
    ).toBeInTheDocument();
  });

  it('does not update state if unmounted before verification resolves (cancelled)', async () => {
    let resolve!: (v: unknown) => void;
    mockVerifyEmail.mockReturnValue(new Promise((r) => (resolve = r)));

    const { unmount } = renderFlow({ token: 'tok_cancel' });

    expect(
      screen.getByRole('heading', { name: /verifying your email/i }),
    ).toBeInTheDocument();

    unmount();
    resolve({ error: null });

    // Give microtask a tick — no error should be thrown and no redirect
    await new Promise((r) => setTimeout(r, 10));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('calls verify with an absolute web callbackURL for autoSignIn cookie', async () => {
    mockVerifyEmail.mockResolvedValue({ error: null });

    renderFlow({ token: 'tok_cb' });

    await screen.findByRole('heading', {
      name: /email verified successfully/i,
    });

    expect(mockVerifyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          callbackURL: `${window.location.origin}/w`,
        }),
      }),
    );
  });

  it('invalidates cached queries on success so the stale session cannot win', async () => {
    mockVerifyEmail.mockResolvedValue({ error: null });

    const { queryClient } = renderFlow({ token: 'tok_invalidate' });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await screen.findByRole('heading', {
      name: /email verified successfully/i,
    });

    // A change-email verification rewrites the user row; without this the
    // session query would keep the old address for its 5-minute staleTime.
    expect(invalidate).toHaveBeenCalled();
  });

  it('leaves the cache alone when verification fails', async () => {
    mockVerifyEmail.mockResolvedValue({ error: { message: 'invalid' } });
    mockGetSession.mockResolvedValue({ data: null });

    const { queryClient } = renderFlow({ token: 'tok_noinvalidate' });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await screen.findByRole('heading', {
      name: /we couldn.*t verify your email/i,
    });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('cleans up redirect timer on unmount after success', async () => {
    mockVerifyEmail.mockResolvedValue({ error: null });

    const { unmount } = renderFlow({ token: 'tok_t' });

    await screen.findByRole('heading', {
      name: /email verified successfully/i,
    });

    unmount();

    await new Promise((r) => setTimeout(r, 1600));

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
