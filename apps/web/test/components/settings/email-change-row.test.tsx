import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockChangeEmail = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    changeEmail: (...args: unknown[]) => mockChangeEmail(...args),
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'harbor' }),
}));

import { EmailChangeRow } from '@/components/settings/email-change-row';

describe('EmailChangeRow — user behaviour (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChangeEmail.mockResolvedValue({ error: null });
  });

  it('rests on the read-only address with a single change affordance', () => {
    render(<EmailChangeRow email="old@shipyard.io" />);

    expect(screen.getByLabelText(/^email$/i)).toHaveValue('old@shipyard.io');
    expect(screen.getByLabelText(/^email$/i)).toHaveAttribute('readonly');
    expect(
      screen.getByRole('button', { name: /change email/i }),
    ).toBeInTheDocument();
    expect(mockChangeEmail).not.toHaveBeenCalled();
  });

  it('sends a confirmation link with a callbackURL that returns to this card', async () => {
    const user = userEvent.setup();
    render(<EmailChangeRow email="old@shipyard.io" />);

    await user.click(screen.getByRole('button', { name: /change email/i }));
    await user.type(screen.getByLabelText(/new email/i), 'new@shipyard.io');
    await user.click(
      screen.getByRole('button', { name: /send confirmation link/i }),
    );

    await waitFor(() =>
      expect(mockChangeEmail).toHaveBeenCalledWith({
        newEmail: 'new@shipyard.io',
        callbackURL: '/verify-email?next=%2Fw%2Fharbor%2Fsettings%2Faccount',
      }),
    );
  });

  it('lands in a neutral pending state that keeps the old address authoritative', async () => {
    const user = userEvent.setup();
    render(<EmailChangeRow email="old@shipyard.io" />);

    await user.click(screen.getByRole('button', { name: /change email/i }));
    await user.type(screen.getByLabelText(/new email/i), 'New@Shipyard.io');
    await user.click(
      screen.getByRole('button', { name: /send confirmation link/i }),
    );

    // The API answers an already-registered address exactly like a free one,
    // so the copy can never claim the address was available or taken.
    expect(await screen.findByText(/pending/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /we sent a confirmation link to new@shipyard\.io\. your email stays old@shipyard\.io until you confirm\./i,
      ),
    ).toBeInTheDocument();
    // Normalised client-side so the copy names the address the link was sent
    // to, not the raw casing typed into the field.
    expect(mockChangeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ newEmail: 'new@shipyard.io' }),
    );
  });

  it('rejects the address already on the account without a request', async () => {
    const user = userEvent.setup();
    render(<EmailChangeRow email="old@shipyard.io" />);

    await user.click(screen.getByRole('button', { name: /change email/i }));
    await user.type(screen.getByLabelText(/new email/i), 'old@shipyard.io');
    await user.click(
      screen.getByRole('button', { name: /send confirmation link/i }),
    );

    expect(
      await screen.findByText(/that is already your email/i),
    ).toBeInTheDocument();
    expect(mockChangeEmail).not.toHaveBeenCalled();
  });

  it('rejects a malformed address with the shared contract message', async () => {
    const user = userEvent.setup();
    render(<EmailChangeRow email="old@shipyard.io" />);

    await user.click(screen.getByRole('button', { name: /change email/i }));
    await user.type(screen.getByLabelText(/new email/i), 'not-an-email');
    await user.click(
      screen.getByRole('button', { name: /send confirmation link/i }),
    );

    expect(
      await screen.findByText(/a valid email is required/i),
    ).toBeInTheDocument();
    expect(mockChangeEmail).not.toHaveBeenCalled();
  });

  it('surfaces an API failure on the field and stays editable', async () => {
    mockChangeEmail.mockResolvedValue({
      error: { message: 'Verification email isn’t enabled.' },
    });

    const user = userEvent.setup();
    render(<EmailChangeRow email="old@shipyard.io" />);

    await user.click(screen.getByRole('button', { name: /change email/i }));
    await user.type(screen.getByLabelText(/new email/i), 'new@shipyard.io');
    await user.click(
      screen.getByRole('button', { name: /send confirmation link/i }),
    );

    expect(
      await screen.findByText(/verification email isn’t enabled\./i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/new email/i)).toBeInTheDocument();
  });

  it('carries the pending address back into editing', async () => {
    const user = userEvent.setup();
    render(<EmailChangeRow email="old@shipyard.io" />);

    await user.click(screen.getByRole('button', { name: /change email/i }));
    await user.type(screen.getByLabelText(/new email/i), 'typo@shipyard.io');
    await user.click(
      screen.getByRole('button', { name: /send confirmation link/i }),
    );

    await user.click(
      await screen.findByRole('button', {
        name: /use a different address/i,
      }),
    );

    // The usual reason to come back is a typo in the address just sent.
    expect(screen.getByLabelText(/new email/i)).toHaveValue('typo@shipyard.io');
  });

  it('resends to the pending address', async () => {
    const user = userEvent.setup();
    render(<EmailChangeRow email="old@shipyard.io" />);

    await user.click(screen.getByRole('button', { name: /change email/i }));
    await user.type(screen.getByLabelText(/new email/i), 'new@shipyard.io');
    await user.click(
      screen.getByRole('button', { name: /send confirmation link/i }),
    );
    await screen.findByText(/pending/i);

    mockChangeEmail.mockClear();
    await user.click(screen.getByRole('button', { name: /resend link/i }));

    await waitFor(() =>
      expect(mockChangeEmail).toHaveBeenCalledWith(
        expect.objectContaining({ newEmail: 'new@shipyard.io' }),
      ),
    );
  });
});
