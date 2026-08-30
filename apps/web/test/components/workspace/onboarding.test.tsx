import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockShowToast = vi.fn();
const mockSetSelected = vi.fn();
let capturedCreateOpts: {
  onSuccess?: (w: unknown) => void;
  onError?: (e: Error) => void;
} | null = null;
const mockMutate = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

vi.mock('@/components/providers/toast-provider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/workspace/selected-workspace', () => ({
  setSelectedWorkspace: (...args: unknown[]) => mockSetSelected(...args),
  getSelectedWorkspace: vi.fn(() => null),
  clearSelectedWorkspace: vi.fn(),
}));

vi.mock('@/hooks/use-workspaces', () => ({
  useCreateWorkspace: vi.fn((opts: unknown) => {
    capturedCreateOpts = opts as typeof capturedCreateOpts;
    return { mutate: mockMutate, isPending: false };
  }),
  useWorkspaces: vi.fn(() => ({
    data: { workspaces: [] },
    isPending: false,
    isError: false,
  })),
  useWorkspace: vi.fn(() => ({ data: null, isPending: false, isError: false })),
  workspaceKeys: { all: ['workspaces'] },
}));

import OnboardingPage from '@/app/onboarding/page';

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('Onboarding + Create workspace — user journeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCreateOpts = null;
    mockMutate.mockReset();
  });

  it('renders heading, name field, icon picker and create button', () => {
    renderWithProviders(<OnboardingPage />);
    expect(
      screen.getByRole('heading', { name: /set up your team/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/workspace name/i)).toBeInTheDocument();
    expect(screen.getByText(/^icon$/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create workspace/i }),
    ).toBeInTheDocument();
  });

  it('empty name shows inline validation and does not call API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingPage />);

    const input = screen.getByLabelText(/workspace name/i);
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    expect(
      await screen.findByText(/workspace name is required/i),
    ).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('valid submit calls create with name and icon', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingPage />);

    const input = screen.getByLabelText(/workspace name/i);
    await user.clear(input);
    await user.type(input, 'Sable & Co');

    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Sable & Co',
          icon: expect.any(String),
        }),
      ),
    );
  });

  it('on success toasts, persists slug and navigates to /w/:slug', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingPage />);

    await user.clear(screen.getByLabelText(/workspace name/i));
    await user.type(screen.getByLabelText(/workspace name/i), 'Acme');
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    await waitFor(() => expect(mockMutate).toHaveBeenCalled());
    const ws = { slug: 'acme-123', name: 'Acme' };
    capturedCreateOpts?.onSuccess?.(ws as unknown);

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        title: 'Workspace created',
      }),
    );
    expect(mockSetSelected).toHaveBeenCalledWith('acme-123');
    expect(mockReplace).toHaveBeenCalledWith('/w/acme-123');
  });

  it('on error shows error toast and stays on form', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingPage />);

    await user.clear(screen.getByLabelText(/workspace name/i));
    await user.type(screen.getByLabelText(/workspace name/i), 'Acme');
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    await waitFor(() => expect(mockMutate).toHaveBeenCalled());
    capturedCreateOpts?.onError?.(new Error('boom'));

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        title: 'Failed to create workspace',
      }),
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/workspace name/i)).toBeInTheDocument();
  });
});
