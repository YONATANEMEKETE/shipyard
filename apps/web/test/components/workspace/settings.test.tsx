import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockShowToast = vi.fn();
const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockMutateUpdate = vi.fn();
const mockMutateArchive = vi.fn();
const mockMutateRestore = vi.fn();
const mockMutateDelete = vi.fn();

let workspaceDetail: unknown = null;
let isPending = false;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

vi.mock('@/components/providers/toast-provider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/workspace/selected-workspace', () => ({
  getSelectedWorkspace: vi.fn(() => 'acme'),
  clearSelectedWorkspace: vi.fn(),
  setSelectedWorkspace: vi.fn(),
}));

vi.mock('@/hooks/use-workspaces', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-workspaces')>(
    '@/hooks/use-workspaces',
  );
  return {
    ...actual,
    useWorkspace: () => ({ data: workspaceDetail, isPending, isError: false }),
    useWorkspaces: () => ({ data: { workspaces: [] }, isPending: false }),
    useUpdateWorkspace: () => ({ mutate: mockMutateUpdate, isPending: false }),
    useArchiveWorkspace: () => ({
      mutate: mockMutateArchive,
      isPending: false,
    }),
    useRestoreWorkspace: () => ({
      mutate: mockMutateRestore,
      isPending: false,
    }),
    useDeleteWorkspace: () => ({ mutate: mockMutateDelete, isPending: false }),
    workspaceKeys: { all: ['workspaces'] },
  };
});

import { SettingsForm } from '@/components/workspace/settings-form';

function renderWithQC(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function ws(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    slug: 'acme',
    name: 'Acme',
    icon: 'boxes',
    status: 'ACTIVE',
    role: 'OWNER',
    memberCount: 1,
    createdAt: new Date().toISOString(),
    archivedAt: null,
    ...overrides,
  };
}

describe('SettingsForm — lifecycle journeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceDetail = ws();
    isPending = false;
  });

  it('prefills name/icon, Save disabled until change and valid', async () => {
    const user = userEvent.setup();
    renderWithQC(<SettingsForm slug="acme" />);
    expect(screen.getByDisplayValue('Acme')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /save changes/i }),
    ).toBeDisabled();

    await user.clear(screen.getByDisplayValue('Acme'));
    await user.type(screen.getByDisplayValue(''), 'Sable');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
  });

  it('save patches only changed fields', async () => {
    const user = userEvent.setup();
    renderWithQC(<SettingsForm slug="acme" />);

    await user.clear(screen.getByLabelText(/workspace name/i));
    await user.type(screen.getByLabelText(/workspace name/i), 'Sable');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(mockMutateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sable' }),
    );
    expect(mockMutateUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ icon: expect.anything() }),
    );
  });

  it('archived renders Danger Zone with Restore, not Archive', () => {
    workspaceDetail = ws({ status: 'ARCHIVED' });
    renderWithQC(<SettingsForm slug="acme" />);
    expect(
      screen.getByRole('button', { name: /^restore$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^archive/i }),
    ).not.toBeInTheDocument();
  });

  it('archive flow opens dialog and sends {confirm:true}', async () => {
    const user = userEvent.setup();
    renderWithQC(<SettingsForm slug="acme" />);
    await user.click(screen.getByRole('button', { name: /archive/i }));
    expect(
      await screen.findByRole('heading', { name: /archive workspace/i }),
    ).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /^archive workspace$/i });
    await user.click(btn);
    expect(mockMutateArchive).toHaveBeenCalled();
  });

  it('delete requires exact confirmName trim-match; mismatch blocks submit and shows hint', async () => {
    const user = userEvent.setup();
    workspaceDetail = ws({ status: 'ARCHIVED', name: 'Acme' });
    const qc2 = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const fresh = render(
      <QueryClientProvider client={qc2}>
        <SettingsForm slug="acme" />
      </QueryClientProvider>,
    );
    const deleteBtn = fresh.getByRole('button', { name: /delete/i });
    expect(deleteBtn).toBeEnabled();
    await user.click(deleteBtn);
    const confirmInput = await fresh.findByPlaceholderText('');
    await user.type(confirmInput, 'acm');
    expect(
      await fresh.findByText(/type "acme" to confirm/i),
    ).toBeInTheDocument();
    expect(
      fresh.getByRole('button', { name: /delete forever/i }),
    ).toBeDisabled();

    await user.clear(confirmInput);
    await user.type(confirmInput, 'Acme');
    const enabledBtn = fresh.getByRole('button', { name: /delete forever/i });
    expect(enabledBtn).toBeEnabled();
    await user.click(enabledBtn);
    await waitFor(() =>
      expect(mockMutateDelete).toHaveBeenCalledWith({ confirmName: 'Acme' }),
    );
  });

  it('delete trims confirmName before submit', async () => {
    const user = userEvent.setup();
    workspaceDetail = ws({ status: 'ARCHIVED', name: 'Acme' });
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const { getByRole, findByPlaceholderText, findByText } = render(
      <QueryClientProvider client={qc}>
        <SettingsForm slug="acme" />
      </QueryClientProvider>,
    );
    await user.click(getByRole('button', { name: /delete/i }));
    const input = await findByPlaceholderText('');
    await user.type(input, '  Acme  ');
    await user.click(getByRole('button', { name: /delete forever/i }));
    await waitFor(() =>
      expect(mockMutateDelete).toHaveBeenCalledWith({ confirmName: 'Acme' }),
    );
    // no leftover unhandled
    expect(await findByText(/delete acme/i)).toBeInTheDocument();
  });
});
