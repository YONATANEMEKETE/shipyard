import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = vi.fn();
const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/w/acme',
  notFound: () => mockNotFound(),
}));

let detailMock: {
  data?: unknown;
  isPending: boolean;
  isError: boolean;
  error?: unknown;
} = {
  data: null,
  isPending: true,
  isError: false,
};
let listMock: {
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
    useWorkspace: () => detailMock,
    useWorkspaces: () => listMock,
    workspaceKeys: { all: ['workspaces'] },
  };
});

import { WorkspaceGate } from '@/components/workspace/workspace-gate';
import { WorkspaceSwitcher } from '@/components/workspace/workspace-switcher';

vi.mock('@/components/providers/toast-provider', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function qcWrap(ui: React.ReactNode) {
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

describe('WorkspaceGate — access and archived rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    detailMock = { data: null, isPending: true, isError: false };
    listMock = { data: { workspaces: [] }, isPending: false, isError: false };
  });

  it('shows loader while pending', () => {
    qcWrap(
      <WorkspaceGate slug="acme">
        <span>child</span>
      </WorkspaceGate>,
    );
    expect(
      screen.getAllByText(/loading workspace/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('404 from detail triggers notFound (non-member or unknown slug)', () => {
    detailMock = {
      data: null,
      isPending: false,
      isError: true,
      error: Object.assign(new Error('nf'), { status: 404 }),
    };
    listMock = { data: { workspaces: [] }, isPending: false, isError: false };
    expect(() =>
      qcWrap(
        <WorkspaceGate slug="acme">
          <span>child</span>
        </WorkspaceGate>,
      ),
    ).toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalled();
  });

  it('archived + MEMBER triggers notFound; archived + OWNER renders child', () => {
    detailMock = {
      data: ws({ status: 'ARCHIVED', role: 'MEMBER' }),
      isPending: false,
      isError: false,
    };
    listMock = {
      data: { workspaces: [ws({ status: 'ARCHIVED', role: 'MEMBER' })] },
      isPending: false,
      isError: false,
    };
    expect(() =>
      qcWrap(
        <WorkspaceGate slug="acme">
          <span>child</span>
        </WorkspaceGate>,
      ),
    ).toThrow('NEXT_NOT_FOUND');

    detailMock = {
      data: ws({ status: 'ARCHIVED', role: 'OWNER' }),
      isPending: false,
      isError: false,
    };
    listMock = {
      data: { workspaces: [ws({ status: 'ARCHIVED', role: 'OWNER' })] },
      isPending: false,
      isError: false,
    };
    qcWrap(
      <WorkspaceGate slug="acme">
        <span>child</span>
      </WorkspaceGate>,
    );
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('active workspace renders children', () => {
    detailMock = {
      data: ws({ status: 'ACTIVE' }),
      isPending: false,
      isError: false,
    };
    listMock = {
      data: { workspaces: [ws({ status: 'ACTIVE' })] },
      isPending: false,
      isError: false,
    };
    qcWrap(
      <WorkspaceGate slug="acme">
        <span>child</span>
      </WorkspaceGate>,
    );
    expect(screen.getByText('child')).toBeInTheDocument();
  });
});

describe('WorkspaceSwitcher — listing and navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock = {
      data: {
        workspaces: [
          ws({ slug: 'acme', name: 'Acme', status: 'ACTIVE', role: 'OWNER' }),
          ws({ slug: 'beta', name: 'Beta', status: 'ACTIVE', role: 'MEMBER' }),
        ],
      },
      isPending: false,
      isError: false,
    };
    detailMock = {
      data: ws({ slug: 'acme' }),
      isPending: false,
      isError: false,
    };
  });

  it('shows current and others with name+role, click navigates to /w/:slug', async () => {
    const user = userEvent.setup();
    qcWrap(<WorkspaceSwitcher slug="acme" />);
    // Open the switcher panel
    await user.click(screen.getByRole('button', { name: /acme/i }));
    expect(await screen.findByText('Beta')).toBeInTheDocument();
    await user.click(screen.getByText('Beta'));
    expect(mockPush).toHaveBeenCalledWith('/w/beta');
  });

  it('collapsed trigger still opens and navigates', async () => {
    const user = userEvent.setup();
    qcWrap(<WorkspaceSwitcher slug="acme" collapsed />);
    await user.click(screen.getByLabelText(/acme/i));
    expect(await screen.findByText('Beta')).toBeInTheDocument();
  });
});
