import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockVerifyEmail = vi.fn();
const mockReplace = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: { verifyEmail: (...args: unknown[]) => mockVerifyEmail(...args) },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
}));

import { VerifyEmailFlow } from '@/components/auth/verify-email-flow';

describe('VerifyEmailFlow — user behaviour (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockVerifyEmail.mockResolvedValue({ error: null });
  });

  it('shows invalid link when no token provided and does not call API', () => {
    render(<VerifyEmailFlow />);

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
    render(<VerifyEmailFlow token="" />);

    expect(
      screen.getByRole('heading', { name: /this link isn.*t valid/i }),
    ).toBeInTheDocument();
    expect(mockVerifyEmail).not.toHaveBeenCalled();
  });

  it('shows verifying state initially when token provided', () => {
    mockVerifyEmail.mockReturnValue(new Promise(() => {}));

    render(<VerifyEmailFlow token="tok_123" />);

    expect(
      screen.getByRole('heading', { name: /verifying your email/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/one moment while we confirm/i),
    ).toBeInTheDocument();
    expect(mockVerifyEmail).toHaveBeenCalledWith({
      query: { token: 'tok_123', callbackURL: '/' },
    });
  });

  it('shows success after verification and auto-redirects after 1.4s', async () => {
    mockVerifyEmail.mockResolvedValue({ error: null });

    render(<VerifyEmailFlow token="tok_success" />);

    expect(
      await screen.findByRole('heading', {
        name: /email verified successfully/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/signing you in/i)).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'), {
      timeout: 2000,
    });
  });

  it('shows error when verification fails', async () => {
    mockVerifyEmail.mockResolvedValue({ error: { message: 'invalid' } });

    render(<VerifyEmailFlow token="tok_bad" />);

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

  it('does not update state if unmounted before verification resolves (cancelled)', async () => {
    let resolve!: (v: unknown) => void;
    mockVerifyEmail.mockReturnValue(new Promise((r) => (resolve = r)));

    const { unmount } = render(<VerifyEmailFlow token="tok_cancel" />);

    expect(
      screen.getByRole('heading', { name: /verifying your email/i }),
    ).toBeInTheDocument();

    unmount();
    resolve({ error: null });

    // Give microtask a tick — no error should be thrown and no redirect
    await new Promise((r) => setTimeout(r, 10));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('calls verify with callbackURL / for autoSignIn cookie', async () => {
    mockVerifyEmail.mockResolvedValue({ error: null });

    render(<VerifyEmailFlow token="tok_cb" />);

    await screen.findByRole('heading', {
      name: /email verified successfully/i,
    });

    expect(mockVerifyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ callbackURL: '/' }),
      }),
    );
  });

  it('cleans up redirect timer on unmount after success', async () => {
    mockVerifyEmail.mockResolvedValue({ error: null });

    const { unmount } = render(<VerifyEmailFlow token="tok_t" />);

    await screen.findByRole('heading', {
      name: /email verified successfully/i,
    });

    unmount();

    await new Promise((r) => setTimeout(r, 1600));

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
