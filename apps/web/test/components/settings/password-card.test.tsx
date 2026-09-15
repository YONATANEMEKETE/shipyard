import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockChangePassword = vi.fn();
const mockListAccounts = vi.fn();
const mockSetPassword = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    changePassword: (...args: unknown[]) => mockChangePassword(...args),
    listAccounts: (...args: unknown[]) => mockListAccounts(...args),
  },
}));

vi.mock('@/lib/api/auth-account', () => ({
  setPassword: (...args: unknown[]) => mockSetPassword(...args),
}));

import { PasswordCard } from '@/components/settings/password-card';
import { ToastProvider } from '@/components/providers/toast-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** An email/password account: the credential row is what the card branches on. */
const WITH_PASSWORD = [{ providerId: 'credential' }, { providerId: 'google' }];

/** OAuth only — no credential row, so there is nothing to change. */
const OAUTH_ONLY = [{ providerId: 'google' }];

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <PasswordCard />
      </ToastProvider>
    </QueryClientProvider>,
  );

  return { ...result, queryClient };
}

/**
 * The result object as better-auth's client actually returns it.
 *
 * better-fetch spreads the parsed response body and adds status/statusText, so
 * the API's envelope lands at `result.error.error` — one level deeper than the
 * API itself sends. That nesting is why the card reads the auth code from
 * `details.auth` rather than off the top of the error.
 */
function apiError(code: string, authCode: string, message: string) {
  return {
    data: null,
    error: {
      error: { code, message, details: { auth: authCode } },
      status: code === 'UNAUTHORIZED' ? 401 : 400,
      statusText: message,
    },
  };
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  current: string,
  next: string,
  confirm = next,
) {
  await user.type(screen.getByLabelText(/current password/i), current);
  await user.type(screen.getByLabelText(/^new password$/i), next);
  await user.type(screen.getByLabelText(/confirm new password/i), confirm);
}

describe('PasswordCard — user behaviour (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChangePassword.mockResolvedValue({
      data: { token: null },
      error: null,
    });
    mockSetPassword.mockResolvedValue({ hasPassword: true });
    // Default to an email/password account; the linked-provider tests override
    // this, so the form tests are genuinely exercising the credential branch.
    mockListAccounts.mockResolvedValue({ data: WITH_PASSWORD, error: null });
  });

  it('lands with three masked fields and a disabled button', async () => {
    renderCard();

    expect(await screen.findByLabelText(/current password/i)).toHaveAttribute(
      'type',
      'password',
    );
    expect(
      screen.getByRole('button', { name: /update password/i }),
    ).toBeDisabled();
  });

  it('refuses an incomplete form once it is dirty', async () => {
    const user = userEvent.setup();
    renderCard();

    // The button only goes live once the form is dirty, so fill one field and
    // leave the other two empty — the submit has to surface both gaps.
    await user.type(screen.getByLabelText(/^new password$/i), 'new-secret-1');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(
      await screen.findByText(/enter your current password/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/repeat the new password/i)).toBeInTheDocument();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('enforces the shared 8-character bound on the new password', async () => {
    const user = userEvent.setup();
    renderCard();

    await fill(user, 'old-secret', 'short');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(
      await screen.findByText(/password must be at least 8 characters/i),
    ).toBeInTheDocument();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('flags a confirmation that does not match, on the confirm field', async () => {
    const user = userEvent.setup();
    renderCard();

    await fill(user, 'old-secret', 'new-secret-1', 'new-secret-2');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(
      await screen.findByText(/passwords do not match/i),
    ).toBeInTheDocument();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('changes the password and ends every other session', async () => {
    const user = userEvent.setup();
    renderCard();

    await fill(user, 'old-secret', 'new-secret-1');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    // revokeOtherSessions is the point: better-auth deletes every session and
    // re-issues one for this browser, so other devices are signed out.
    await waitFor(() =>
      expect(mockChangePassword).toHaveBeenCalledWith({
        currentPassword: 'old-secret',
        newPassword: 'new-secret-1',
        revokeOtherSessions: true,
      }),
    );
  });

  it('clears the fields and confirms on success', async () => {
    const user = userEvent.setup();
    renderCard();

    await fill(user, 'old-secret', 'new-secret-1');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/current password/i)).toHaveValue(''),
    );
    expect(screen.getByLabelText(/^new password$/i)).toHaveValue('');
    expect(screen.getByLabelText(/confirm new password/i)).toHaveValue('');
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
  });

  it('puts a wrong current password on the field, not the card', async () => {
    mockChangePassword.mockResolvedValue(
      apiError('VALIDATION_ERROR', 'INVALID_PASSWORD', 'Invalid password'),
    );

    const user = userEvent.setup();
    renderCard();

    await fill(user, 'wrong-secret', 'new-secret-1');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(
      await screen.findByText(/that is not your current password/i),
    ).toBeInTheDocument();
    // The API's bare "Invalid password" never reaches the user.
    expect(screen.queryByText(/^invalid password$/i)).not.toBeInTheDocument();
  });

  it('offers set mode when the credential row vanished mid-flight', async () => {
    // The API maps this to 401, so only details.auth distinguishes it from a
    // dead session — which is exactly the case the card reads it for.
    mockChangePassword.mockResolvedValue(
      apiError(
        'UNAUTHORIZED',
        'CREDENTIAL_ACCOUNT_NOT_FOUND',
        'Credential account not found',
      ),
    );

    const user = userEvent.setup();
    renderCard();

    await fill(user, 'old-secret', 'new-secret-1');

    // The account no longer has a credential row, so the next read says so.
    mockListAccounts.mockResolvedValue({ data: OAUTH_ONLY, error: null });
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(
      await screen.findByText(/no longer has a password to change/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /set password/i }),
    ).toBeInTheDocument();
  });

  it('falls back to the API message for anything unrecognised', async () => {
    mockChangePassword.mockResolvedValue(
      apiError('RATE_LIMITED', 'TOO_MANY_REQUESTS', 'Too many requests'),
    );

    const user = userEvent.setup();
    renderCard();

    await fill(user, 'old-secret', 'new-secret-1');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByText(/too many requests/i)).toBeInTheDocument();
  });

  it('drops the card error as soon as the user edits again', async () => {
    mockChangePassword.mockResolvedValue(
      apiError('INTERNAL_SERVER_ERROR', 'UNKNOWN', 'An unexpected error'),
    );

    const user = userEvent.setup();
    renderCard();

    await fill(user, 'old-secret', 'new-secret-1');
    await user.click(screen.getByRole('button', { name: /update password/i }));
    await screen.findByText(/an unexpected error/i);

    await user.type(screen.getByLabelText(/current password/i), '!');
    expect(screen.queryByText(/an unexpected error/i)).not.toBeInTheDocument();
  });

  // ── Linked-provider accounts: set mode ──

  it('asks for a first password without a current-password field', async () => {
    mockListAccounts.mockResolvedValue({ data: OAUTH_ONLY, error: null });

    renderCard();

    expect(
      await screen.findByText(/signs in with Google, so it has no password/i),
    ).toBeInTheDocument();
    // Nothing to confirm yet, so the field is absent rather than disabled.
    expect(
      screen.queryByLabelText(/current password/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /set password/i }),
    ).toBeInTheDocument();
  });

  it('sets the password through the Auth extension route, not changePassword', async () => {
    mockListAccounts.mockResolvedValue({ data: OAUTH_ONLY, error: null });

    const user = userEvent.setup();
    renderCard();

    await user.type(
      await screen.findByLabelText(/^new password$/i),
      'new-secret-1',
    );
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      'new-secret-1',
    );
    await user.click(screen.getByRole('button', { name: /set password/i }));

    await waitFor(() =>
      expect(mockSetPassword).toHaveBeenCalledWith({
        newPassword: 'new-secret-1',
      }),
    );
    // No current password is invented for a route that takes one argument.
    expect(mockChangePassword).not.toHaveBeenCalled();
    expect(await screen.findByText(/password set/i)).toBeInTheDocument();
  });

  it('flips to change mode when a password appeared in another tab', async () => {
    mockListAccounts.mockResolvedValue({ data: OAUTH_ONLY, error: null });
    mockSetPassword.mockRejectedValue({
      code: 'CONFLICT',
      message: 'Password already set',
      details: { auth: 'PASSWORD_ALREADY_SET' },
    });

    const user = userEvent.setup();
    renderCard();

    await user.type(
      await screen.findByLabelText(/^new password$/i),
      'new-secret-1',
    );
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      'new-secret-1',
    );

    // The next read reports the credential row that now exists.
    mockListAccounts.mockResolvedValue({ data: WITH_PASSWORD, error: null });
    await user.click(screen.getByRole('button', { name: /set password/i }));

    expect(
      await screen.findByText(/a password already exists for this account/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText(/current password/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /update password/i }),
    ).toBeInTheDocument();
  });

  it('keeps the form when the sign-in methods cannot be read', async () => {
    mockListAccounts.mockResolvedValue({
      data: null,
      error: { message: 'offline' },
    });

    renderCard();

    // Unknown reads as "has a password" — the error mapping downstream still
    // catches an OAuth-only account if it tries anyway.
    expect(
      await screen.findByLabelText(/current password/i),
    ).toBeInTheDocument();
  });
});
