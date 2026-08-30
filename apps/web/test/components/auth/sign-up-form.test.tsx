import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockSignUpEmail = vi.fn();
const mockSendVerificationEmail = vi.fn();
const mockSocialSignIn = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signUp: { email: (...args: unknown[]) => mockSignUpEmail(...args) },
    sendVerificationEmail: (...args: unknown[]) =>
      mockSendVerificationEmail(...args),
    signIn: { social: (...args: unknown[]) => mockSocialSignIn(...args) },
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { SignUpForm } from '@/components/auth/sign-up-form';

function renderWithProviders(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('SignUpForm — user behaviour (isolated)', () => {
  beforeAll(() => {
    // mutateAsync rejections bubble as unhandledrejection in jsdom — suppress expected auth errors
    if (typeof window !== 'undefined') {
      window.addEventListener(
        'unhandledrejection',
        (event: PromiseRejectionEvent) => {
          const msg = (event.reason as Error | undefined)?.message ?? '';
          if (
            msg === 'Email already taken' ||
            msg === 'Unable to create your account. Please try again.' ||
            msg === 'boom'
          ) {
            event.preventDefault();
          }
        },
      );
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSignUpEmail.mockResolvedValue({ error: null });
    mockSendVerificationEmail.mockResolvedValue({ error: null });
    mockSocialSignIn.mockResolvedValue({ error: null });
  });

  it('lands with header, fields, social buttons and sign-in link', () => {
    renderWithProviders(<SignUpForm />);

    expect(
      screen.getByRole('heading', { name: /create your account/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/start planning, building/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByText(/must be between 8 and 128/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create account/i }),
    ).toBeInTheDocument();
    // Social buttons are part of the initial form
    expect(
      screen.getByRole('button', { name: /^google$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^github$/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/already have an account/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/sign-in',
    );
  });

  it('shows validation errors for empty submit and does not call API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpForm />);

    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/a valid email is required/i),
    ).toBeInTheDocument();
    // password required is the shared schema’s 8-char message, but empty also hits min
    expect(
      await screen.findByText(/password must be at least 8 characters/i),
    ).toBeInTheDocument();
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it('validates email format', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpForm />);

    await user.type(screen.getByLabelText(/^name$/i), 'Ada Lovelace');
    await user.type(screen.getByLabelText(/^email$/i), 'not-an-email');
    await user.type(screen.getByLabelText(/^password$/i), 'sup3r-secret-pass');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByText(/a valid email is required/i),
    ).toBeInTheDocument();
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it('validates password minimum length', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpForm />);

    await user.type(screen.getByLabelText(/^name$/i), 'Ada');
    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'short');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByText(/password must be at least 8 characters/i),
    ).toBeInTheDocument();
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it('clears validation message after fixing input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpForm />);

    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^name$/i), 'Ada');
    // Trigger validation again by submitting — name error should disappear after typing
    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'sup3r-secret-pass');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(screen.queryByText(/name is required/i)).not.toBeInTheDocument(),
    );
  });

  it('shows pending state while creating account', async () => {
    const user = userEvent.setup();
    let resolve!: (v: unknown) => void;
    mockSignUpEmail.mockReturnValue(new Promise((r) => (resolve = r)));

    renderWithProviders(<SignUpForm />);

    await user.type(screen.getByLabelText(/^name$/i), 'Ada');
    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'sup3r-secret-pass');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByRole('button', { name: /creating account/i }),
    ).toBeDisabled();
    // social buttons also disabled via busy is not checked here, but form button is

    resolve({ error: null });
    await screen.findByRole('heading', { name: /check your email/i });
  });

  it('on success swaps to check-your-email variant with sent email and resend', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpForm />);

    await user.type(screen.getByLabelText(/^name$/i), 'Ada');
    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'sup3r-secret-pass');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByRole('heading', { name: /check your email/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(
      screen.getByText(/we sent a verification link/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /resend verification email/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/sign-in',
    );
    // Form should be gone
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();
    expect(mockSignUpEmail).toHaveBeenCalledWith({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'sup3r-secret-pass',
    });
  });

  it('resend verification shows sending then sent confirmation', async () => {
    const user = userEvent.setup();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithProviders(<SignUpForm />);

    await user.type(screen.getByLabelText(/^name$/i), 'Ada');
    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'sup3r-secret-pass');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await screen.findByRole('heading', { name: /check your email/i });

    const resendButton = screen.getByRole('button', {
      name: /resend verification email/i,
    });
    let resendResolve!: (v: unknown) => void;
    mockSendVerificationEmail.mockReturnValue(
      new Promise((r) => (resendResolve = r)),
    );

    await user.click(resendButton);

    expect(
      await screen.findByRole('button', { name: /sending/i }),
    ).toBeDisabled();
    resendResolve({ error: null });

    expect(
      await screen.findByText(/verification email sent/i),
    ).toBeInTheDocument();
    expect(mockSendVerificationEmail).toHaveBeenCalledWith({
      email: 'ada@example.com',
      callbackURL: '/verify-email',
    });

    // After 4s it reverts to button
    vi.advanceTimersByTime(4000);
    expect(
      await screen.findByRole('button', { name: /resend verification email/i }),
    ).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('resend handles error and stays idle with message', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpForm />);

    await user.type(screen.getByLabelText(/^name$/i), 'Ada');
    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'sup3r-secret-pass');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await screen.findByRole('heading', { name: /check your email/i });

    mockSendVerificationEmail.mockResolvedValue({
      error: { message: 'rate limited' },
    });
    // The onResend in SignUpForm throws if r.error, which ResendVerificationButton catches
    await user.click(
      screen.getByRole('button', { name: /resend verification email/i }),
    );

    expect(
      await screen.findByText(/could not send the email/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /resend verification email/i }),
    ).toBeInTheDocument();
  });

  it('shows API error via FormError and keeps form', async () => {
    const user = userEvent.setup();
    mockSignUpEmail.mockResolvedValue({
      error: { message: 'Email already taken' },
    });
    renderWithProviders(<SignUpForm />);

    await user.type(screen.getByLabelText(/^name$/i), 'Ada');
    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'sup3r-secret-pass');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/email already taken/i)).toBeInTheDocument();
    // Still on form
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create account/i }),
    ).toBeEnabled();
  });

  it('falls back to generic error when API returns empty message', async () => {
    const user = userEvent.setup();
    mockSignUpEmail.mockResolvedValue({ error: { message: '' } });
    renderWithProviders(<SignUpForm />);

    await user.type(screen.getByLabelText(/^name$/i), 'Ada');
    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'sup3r-secret-pass');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByText(/unable to create your account/i),
    ).toBeInTheDocument();
  });

  it('social buttons call social sign-in and respect busy state', async () => {
    const user = userEvent.setup();
    let resolveSocial!: (v: unknown) => void;
    mockSocialSignIn.mockReturnValue(new Promise((r) => (resolveSocial = r)));
    renderWithProviders(<SignUpForm />);

    const google = screen.getByRole('button', { name: /^google$/i });
    const github = screen.getByRole('button', { name: /^github$/i });

    await user.click(google);

    expect(mockSocialSignIn).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: '/w',
    });
    // While pending, busy disables both
    expect(
      await screen.findByRole('button', { name: /google/i }),
    ).toBeDisabled();
    expect(github).toBeDisabled();

    resolveSocial({ error: null });
  });

  it('social error keeps buttons enabled and shows generic message', async () => {
    const user = userEvent.setup();
    mockSocialSignIn.mockResolvedValue({ error: { message: 'oauth failed' } });
    renderWithProviders(<SignUpForm />);

    await user.click(screen.getByRole('button', { name: /^google$/i }));

    expect(
      await screen.findByText(/unable to start sign-in with this provider/i),
    ).toBeInTheDocument();
    // busy cleared on error, buttons re-enabled
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^google$/i })).toBeEnabled(),
    );
  });

  it('has accessible aria-live for submit errors', async () => {
    const user = userEvent.setup();
    mockSignUpEmail.mockResolvedValue({ error: { message: 'boom' } });
    renderWithProviders(<SignUpForm />);

    await user.type(screen.getByLabelText(/^name$/i), 'Ada');
    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'sup3r-secret-pass');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    const liveRegion = await screen.findByText(/boom/i);
    expect(liveRegion.closest('[aria-live="polite"]')).toBeInTheDocument();
  });
});
