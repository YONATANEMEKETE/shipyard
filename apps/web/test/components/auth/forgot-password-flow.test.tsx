import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRequestPasswordReset = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    requestPasswordReset: (...args: unknown[]) =>
      mockRequestPasswordReset(...args),
  },
}));

import { ForgotPasswordFlow } from '@/components/auth/forgot-password-flow';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('ForgotPasswordForm — isolated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestPasswordReset.mockResolvedValue({ error: null });
  });

  it('lands with email field and links', () => {
    renderWithProviders(<ForgotPasswordForm />);

    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /send reset link/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/sign-in',
    );
  });

  it('validates empty and invalid email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordForm />);

    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(
      await screen.findByText(/a valid email is required/i),
    ).toBeInTheDocument();
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^email$/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(
      await screen.findByText(/a valid email is required/i),
    ).toBeInTheDocument();
  });

  it('shows pending while sending', async () => {
    const user = userEvent.setup();
    let resolve!: (v: unknown) => void;
    mockRequestPasswordReset.mockReturnValue(new Promise((r) => (resolve = r)));

    renderWithProviders(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(
      await screen.findByRole('button', { name: /sending reset link/i }),
    ).toBeDisabled();

    resolve({ error: null });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /send reset link/i }),
      ).toBeEnabled(),
    );
  });

  it('calls requestPasswordReset with email and redirectTo', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithProviders(<ForgotPasswordForm onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() =>
      expect(mockRequestPasswordReset).toHaveBeenCalledWith({
        email: 'ada@example.com',
        redirectTo: '/reset-password',
      }),
    );
    expect(onSuccess).toHaveBeenCalledWith('ada@example.com');
  });

  it('shows transport error and stays on form', async () => {
    const user = userEvent.setup();
    mockRequestPasswordReset.mockResolvedValue({
      error: { message: 'network down' },
    });
    renderWithProviders(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/network down/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
  });

  it('falls back to generic error when no message', async () => {
    const user = userEvent.setup();
    mockRequestPasswordReset.mockResolvedValue({ error: {} });
    renderWithProviders(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(
      await screen.findByText(/unable to send the reset link/i),
    ).toBeInTheDocument();
  });
});

describe('ForgotPasswordFlow — user behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestPasswordReset.mockResolvedValue({ error: null });
  });

  it('lands with header and form, swaps to sent variant after success', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordFlow />);

    expect(
      screen.getByRole('heading', { name: /forgot your password/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(
      await screen.findByRole('heading', { name: /check your email/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText(/expires in 1 hour/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /resend reset link/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /back to sign in/i }),
    ).toHaveAttribute('href', '/sign-in');
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
  });

  it('resend shows sent confirmation and handles error', async () => {
    const user = userEvent.setup();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithProviders(<ForgotPasswordFlow />);

    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    await screen.findByRole('heading', { name: /check your email/i });

    // Success resend
    mockRequestPasswordReset.mockResolvedValue({ error: null });
    await user.click(
      screen.getByRole('button', { name: /resend reset link/i }),
    );
    expect(await screen.findByText(/reset link sent/i)).toBeInTheDocument();

    vi.advanceTimersByTime(4000);
    expect(
      await screen.findByRole('button', { name: /resend reset link/i }),
    ).toBeInTheDocument();

    // Error resend
    mockRequestPasswordReset.mockResolvedValue({ error: { message: 'oops' } });
    await user.click(
      screen.getByRole('button', { name: /resend reset link/i }),
    );
    expect(
      await screen.findByText(/could not send the email/i),
    ).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('resend calls requestPasswordReset with sent email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordFlow />);

    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    await screen.findByRole('heading', { name: /check your email/i });

    mockRequestPasswordReset.mockClear();
    mockRequestPasswordReset.mockResolvedValue({ error: null });

    await user.click(
      screen.getByRole('button', { name: /resend reset link/i }),
    );

    await waitFor(() =>
      expect(mockRequestPasswordReset).toHaveBeenCalledWith({
        email: 'ada@example.com',
        redirectTo: '/reset-password',
      }),
    );
  });
});
