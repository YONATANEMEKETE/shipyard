import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockResetPassword = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    resetPassword: (...args: unknown[]) => mockResetPassword(...args),
  },
}));

import { ResetPasswordFlow } from '@/components/auth/reset-password-flow';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('ResetPasswordFlow — user behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResetPassword.mockResolvedValue({ error: null });
  });

  it('shows invalid when no token', () => {
    renderWithProviders(<ResetPasswordFlow />);

    expect(
      screen.getByRole('heading', { name: /this link isn.*t valid/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/missing, invalid, or has expired/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /request a new link/i }),
    ).toHaveAttribute('href', '/forgot-password');
  });

  it('shows invalid for empty token', () => {
    renderWithProviders(<ResetPasswordFlow token="" />);

    expect(
      screen.getByRole('heading', { name: /this link isn.*t valid/i }),
    ).toBeInTheDocument();
  });

  it('shows form when token present', () => {
    renderWithProviders(<ResetPasswordFlow token="tok_123" />);

    expect(
      screen.getByRole('heading', { name: /choose a new password/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
    expect(screen.getByText(/must be between 8 and 128/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /reset password/i }),
    ).toBeInTheDocument();
  });

  it('transitions to updated after successful reset', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordFlow token="tok_ok" />);

    await user.type(screen.getByLabelText(/new password/i), 'new-sup3r-pass');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(
      await screen.findByRole('heading', { name: /password updated/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/your password has been changed/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /continue to sign in/i }),
    ).toHaveAttribute('href', '/sign-in');
  });

  it('transitions to invalid when token rejected', async () => {
    const user = userEvent.setup();
    mockResetPassword.mockResolvedValue({
      error: { status: 401, error: { details: { auth: 'INVALID_TOKEN' } } },
    });

    renderWithProviders(<ResetPasswordFlow token="tok_bad" />);

    await user.type(screen.getByLabelText(/new password/i), 'new-sup3r-pass');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(
      await screen.findByRole('heading', { name: /this link isn.*t valid/i }),
    ).toBeInTheDocument();
  });
});

describe('ResetPasswordForm — isolated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResetPassword.mockResolvedValue({ error: null });
  });

  it('validates empty and short password', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ResetPasswordForm
        token="tok"
        onUpdated={vi.fn()}
        onInvalidToken={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /reset password/i }));
    expect(
      await screen.findByText(/password must be at least 8 characters/i),
    ).toBeInTheDocument();
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('validates too long password', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ResetPasswordForm
        token="tok"
        onUpdated={vi.fn()}
        onInvalidToken={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/new password/i), 'a'.repeat(129));
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(
      await screen.findByText(/password must be at most 128 characters/i),
    ).toBeInTheDocument();
  });

  it('shows pending while updating', async () => {
    const user = userEvent.setup();
    let resolve!: (v: unknown) => void;
    mockResetPassword.mockReturnValue(new Promise((r) => (resolve = r)));

    renderWithProviders(
      <ResetPasswordForm
        token="tok"
        onUpdated={vi.fn()}
        onInvalidToken={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/new password/i), 'new-sup3r-pass');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(
      await screen.findByRole('button', { name: /updating password/i }),
    ).toBeDisabled();

    resolve({ error: null });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /reset password/i }),
      ).toBeEnabled(),
    );
  });

  it('calls resetPassword with token and newPassword and triggers onUpdated', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    const onInvalidToken = vi.fn();
    renderWithProviders(
      <ResetPasswordForm
        token="tok_abc"
        onUpdated={onUpdated}
        onInvalidToken={onInvalidToken}
      />,
    );

    await user.type(screen.getByLabelText(/new password/i), 'new-sup3r-pass');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() =>
      expect(mockResetPassword).toHaveBeenCalledWith({
        newPassword: 'new-sup3r-pass',
        token: 'tok_abc',
      }),
    );
    expect(onUpdated).toHaveBeenCalled();
    expect(onInvalidToken).not.toHaveBeenCalled();
  });

  it('maps 401/INVALID_TOKEN to onInvalidToken without generic error', async () => {
    const user = userEvent.setup();
    const onInvalidToken = vi.fn();
    const onUpdated = vi.fn();
    mockResetPassword.mockResolvedValue({
      error: { status: 401, error: { details: { auth: 'TOKEN_EXPIRED' } } },
    });

    renderWithProviders(
      <ResetPasswordForm
        token="tok_exp"
        onUpdated={onUpdated}
        onInvalidToken={onInvalidToken}
      />,
    );

    await user.type(screen.getByLabelText(/new password/i), 'new-sup3r-pass');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => expect(onInvalidToken).toHaveBeenCalled());
    expect(onUpdated).not.toHaveBeenCalled();
    expect(screen.queryByText(/unable to update/i)).not.toBeInTheDocument();
  });

  it('shows generic error for other failures', async () => {
    const user = userEvent.setup();
    mockResetPassword.mockResolvedValue({ error: { status: 500, error: {} } });

    renderWithProviders(
      <ResetPasswordForm
        token="tok"
        onUpdated={vi.fn()}
        onInvalidToken={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/new password/i), 'new-sup3r-pass');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(
      await screen.findByText(/unable to update your password/i),
    ).toBeInTheDocument();
  });

  it('has sign-in link', () => {
    renderWithProviders(
      <ResetPasswordForm
        token="tok"
        onUpdated={vi.fn()}
        onInvalidToken={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/sign-in',
    );
  });
});
