import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockSignInEmail = vi.fn();
const mockSocialSignIn = vi.fn();
const mockReplace = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: {
      email: (...args: unknown[]) => mockSignInEmail(...args),
      social: (...args: unknown[]) => mockSocialSignIn(...args),
    },
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
}));

import { SignInForm } from '@/components/auth/sign-in-form';

function renderWithProviders(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('SignInForm — user behaviour (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInEmail.mockResolvedValue({ error: null });
    mockSocialSignIn.mockResolvedValue({ error: null });
  });

  it('lands with email, password, rememberMe, forgot link, social and sign-up link', () => {
    renderWithProviders(<SignInForm />);

    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/keep me signed in/i)).toBeInTheDocument();
    // rememberMe defaults to true
    expect(screen.getByLabelText(/keep me signed in/i)).toBeChecked();
    expect(
      screen.getByRole('link', { name: /forgot password\?/i }),
    ).toHaveAttribute('href', '/forgot-password');
    expect(
      screen.getByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^google$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^github$/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/don.*t have an account/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create one/i })).toHaveAttribute(
      'href',
      '/sign-up',
    );
  });

  it('shows validation errors for empty submit', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignInForm />);

    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(
      await screen.findByText(/a valid email is required/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/password is required/i),
    ).toBeInTheDocument();
    expect(mockSignInEmail).not.toHaveBeenCalled();
  });

  it('validates email format', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignInForm />);

    await user.type(screen.getByLabelText(/^email$/i), 'not-an-email');
    await user.type(screen.getByLabelText(/^password$/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(
      await screen.findByText(/a valid email is required/i),
    ).toBeInTheDocument();
    expect(mockSignInEmail).not.toHaveBeenCalled();
  });

  it('toggles rememberMe', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignInForm />);

    const checkbox = screen.getByLabelText(/keep me signed in/i);
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('submits with rememberMe value', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignInForm />);

    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'sup3r-secret-pass');
    // uncheck rememberMe
    await user.click(screen.getByLabelText(/keep me signed in/i));

    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() =>
      expect(mockSignInEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ada@example.com',
          rememberMe: false,
        }),
      ),
    );
  });

  it('shows pending state while signing in', async () => {
    const user = userEvent.setup();
    let resolve!: (v: unknown) => void;
    mockSignInEmail.mockReturnValue(new Promise((r) => (resolve = r)));

    renderWithProviders(<SignInForm />);

    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'pass');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(
      await screen.findByRole('button', { name: /signing in/i }),
    ).toBeDisabled();

    resolve({ error: null });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('on success redirects to workspace root', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignInForm />);

    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'sup3r-secret-pass');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockSignInEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ada@example.com',
        password: 'sup3r-secret-pass',
        rememberMe: true,
      }),
    );
  });

  it('maps EMAIL_NOT_VERIFIED to verify-email message', async () => {
    const user = userEvent.setup();
    mockSignInEmail.mockResolvedValue({
      error: {
        status: 401,
        error: {
          message: 'not verified',
          details: { auth: 'EMAIL_NOT_VERIFIED' },
        },
      },
    });
    renderWithProviders(<SignInForm />);

    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'pass');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(
      await screen.findByText(/please verify your email address/i),
    ).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('maps 429 to rate-limited message', async () => {
    const user = userEvent.setup();
    mockSignInEmail.mockResolvedValue({
      error: { status: 429, error: { message: 'too many' } },
    });
    renderWithProviders(<SignInForm />);

    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'pass');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
  });

  it('maps 401/400 to Invalid email or password', async () => {
    const user = userEvent.setup();
    mockSignInEmail.mockResolvedValue({
      error: {
        status: 401,
        error: {
          message: 'bad',
          details: { auth: 'INVALID_EMAIL_OR_PASSWORD' },
        },
      },
    });
    renderWithProviders(<SignInForm />);

    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(
      await screen.findByText(/invalid email or password/i),
    ).toBeInTheDocument();
  });

  it('falls back to envelope message then generic', async () => {
    const user = userEvent.setup();
    mockSignInEmail.mockResolvedValue({
      error: { status: 500, error: { message: 'envelope msg' } },
    });
    renderWithProviders(<SignInForm />);

    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'pass');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/envelope msg/i)).toBeInTheDocument();
  });

  it('falls back to generic when no envelope message', async () => {
    const user = userEvent.setup();
    mockSignInEmail.mockResolvedValue({ error: { status: 500, error: {} } });
    renderWithProviders(<SignInForm />);

    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'pass');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/unable to sign in/i)).toBeInTheDocument();
  });

  it('has aria-live for submit errors', async () => {
    const user = userEvent.setup();
    mockSignInEmail.mockResolvedValue({
      error: { status: 401, error: { message: 'bad' } },
    });
    renderWithProviders(<SignInForm />);

    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    const msg = await screen.findByText(/invalid email or password/i);
    expect(msg.closest('[aria-live="polite"]')).toBeInTheDocument();
  });

  it('social buttons call social sign-in with provider', async () => {
    const user = userEvent.setup();
    let resolveSocial!: (v: unknown) => void;
    mockSocialSignIn.mockReturnValue(new Promise((r) => (resolveSocial = r)));
    renderWithProviders(<SignInForm />);

    await user.click(screen.getByRole('button', { name: /^google$/i }));
    expect(mockSocialSignIn).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: '/',
    });
    expect(screen.getByRole('button', { name: /^google$/i })).toBeDisabled();

    resolveSocial({ error: null });
  });
});
