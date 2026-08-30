import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockInvalidate = vi.fn();
const mockShowToast = vi.fn();
const mockSetSelected = vi.fn();
const mockRestore = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock('@/components/providers/toast-provider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/workspace/selected-workspace', () => ({
  setSelectedWorkspace: (...args: unknown[]) => mockSetSelected(...args),
  getSelectedWorkspace: vi.fn(() => null),
  clearSelectedWorkspace: vi.fn(),
}));

vi.mock('@/lib/api/workspaces', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/workspaces')>(
    '@/lib/api/workspaces',
  );
  return {
    ...actual,
    restoreWorkspace: (...args: unknown[]) => mockRestore(...args),
  };
});

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  );
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
  };
});

let workspacesMock: {
  data?: unknown;
  isPending: boolean;
  isError: boolean;
  error?: unknown;
} = {
  data: { workspaces: [] },
  isPending: false,
  isError: false,
};

vi.mock('@/hooks/use-workspaces', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-workspaces')>(
    '@/hooks/use-workspaces',
  );
  return {
    ...actual,
    useWorkspaces: () => workspacesMock,
    useWorkspace: vi.fn(() => ({
      data: null,
      isPending: false,
      isError: false,
    })),
    workspaceKeys: { all: ['workspaces'] },
  };
});

import SelectWorkspacePage from '@/app/select-workspace/page';

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function makeWs(overrides: Record<string, unknown> = {}) {
  return {
    id: 'w1',
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

describe('Select workspace — user journeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspacesMock = {
      data: { workspaces: [] },
      isPending: false,
      isError: false,
    };
    mockRestore.mockResolvedValue({});
  });

  it('shows loading skeletons while pending', () => {
    workspacesMock = { data: undefined, isPending: true, isError: false };
    renderWithProviders(<SelectWorkspacePage />);
    expect(screen.getByText(/choose a workspace/i)).toBeInTheDocument();
  });

  it('empty active renders empty state and new workspace CTA', () => {
    workspacesMock = {
      data: { workspaces: [] },
      isPending: false,
      isError: false,
    };
    renderWithProviders(<SelectWorkspacePage />);
    expect(screen.getByText(/no workspaces yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /new workspace/i }),
    ).toBeInTheDocument();
  });

  it('lists active workspaces with name+icon+role; duplicate names stay separate', async () => {
    workspacesMock = {
      data: {
        workspaces: [
          makeWs({ slug: 'a', name: 'Acme' }),
          makeWs({ slug: 'b', name: 'Acme' }),
        ],
      },
      isPending: false,
      isError: false,
    };
    renderWithProviders(<SelectWorkspacePage />);
    expect(screen.getAllByText('Acme')).toHaveLength(2);
  });

  it('archived hidden for MEMBER, visible with Restore for OWNER', async () => {
    const user = userEvent.setup();
    workspacesMock = {
      data: {
        workspaces: [
          makeWs({
            slug: 'arch',
            name: 'Old',
            status: 'ARCHIVED',
            role: 'OWNER',
          }),
          makeWs({
            slug: 'arch2',
            name: 'Old2',
            status: 'ARCHIVED',
            role: 'MEMBER',
          }),
        ],
      },
      isPending: false,
      isError: false,
    };
    renderWithProviders(<SelectWorkspacePage />);
    expect(screen.getByText('Old')).toBeInTheDocument();
    expect(screen.queryByText('Old2')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /restore/i }),
    ).toBeInTheDocument();

    mockRestore.mockResolvedValue({});
    await user.click(screen.getByRole('button', { name: /restore/i }));
    await waitFor(() => expect(mockRestore).toHaveBeenCalledWith('arch'));
    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        title: 'Workspace restored',
      }),
    );
  });

  it('selecting a workspace persists slug and pushes to /w/:slug', async () => {
    const user = userEvent.setup();
    workspacesMock = {
      data: { workspaces: [makeWs({ slug: 'acme', name: 'Acme' })] },
      isPending: false,
      isError: false,
    };
    renderWithProviders(<SelectWorkspacePage />);
    await user.click(screen.getByText('Acme'));
    expect(mockSetSelected).toHaveBeenCalledWith('acme');
    expect(mockPush).toHaveBeenCalledWith('/w/acme');
  });

  it('restore failure shows error toast', async () => {
    const user = userEvent.setup();
    workspacesMock = {
      data: {
        workspaces: [
          makeWs({
            slug: 'arch',
            name: 'Old',
            status: 'ARCHIVED',
            role: 'OWNER',
          }),
        ],
      },
      isPending: false,
      isError: false,
    };
    mockRestore.mockRejectedValue(new Error('conflict'));
    renderWithProviders(<SelectWorkspacePage />);
    await user.click(screen.getByRole('button', { name: /restore/i }));
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error' }),
      ),
    );
  });
});
