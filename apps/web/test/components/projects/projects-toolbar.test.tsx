import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  ProjectStatus,
  ViewPreference,
  WorkspaceMemberCard,
} from '@shipyard/shared';
import type React from 'react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ProjectsToolbar,
  type ProjectFilters,
} from '@/components/projects/projects-toolbar';

// ── Hook mocks — no API layer needed; the toolbar consumes three hooks and
//    we stub them exactly like the settings/members suites do. ─────────────
let viewPrefData: ViewPreference | undefined = undefined;
let rosterData: { members: WorkspaceMemberCard[] } = { members: [] };
const mockSetView = vi.fn();

vi.mock('@/hooks/use-projects', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-projects')>(
    '@/hooks/use-projects',
  );
  return {
    ...actual,
    useViewPreference: () => ({ data: viewPrefData }),
    useSetViewPreference: () => ({ mutate: mockSetView, isPending: false }),
  };
});

vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({ data: rosterData, isPending: false }),
}));

function member(
  overrides: Partial<WorkspaceMemberCard> = {},
): WorkspaceMemberCard {
  return {
    id: 'cm0mem0001',
    userId: 'usr_1',
    workspaceId: 'ws_1',
    name: 'Yonatane Mekete',
    email: 'yonatane@harbor.test',
    image: null,
    role: 'OWNER',
    createdAt: '2026-08-12T09:00:00.000Z',
    ...overrides,
  };
}

/** The parent-owned filter state the toolbar patches via onChange. */
function baseFilters(overrides: Partial<ProjectFilters> = {}): ProjectFilters {
  return { search: '', sort: 'createdAt', order: 'desc', ...overrides };
}

function renderWithQC(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

/**
 * Harness — holds filter/archived state in React state exactly like the real
 * projects page parent. The toolbar's `onChange` patches still flow through
 * the recorded spy so we can assert what was sent, but the controlled inputs
 * (search, select labels) re-render from real state like in production.
 */
function ToolbarHarness({
  initial = baseFilters(),
  archived = false,
  onArchivedChange,
  onFiltersChange,
}: {
  initial?: ProjectFilters;
  archived?: boolean;
  onArchivedChange?: (archived: boolean) => void;
  onFiltersChange?: (filters: ProjectFilters) => void;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <ProjectsToolbar
      slug="acme"
      filters={filters}
      onChange={(next) => {
        onFiltersChange?.(next);
        setFilters(next);
      }}
      archived={archived}
      onArchivedChange={onArchivedChange}
    />
  );
}

function renderHarness(
  options: {
    initial?: ProjectFilters;
    archived?: boolean;
    onArchivedChange?: ((archived: boolean) => void) | undefined;
    onFiltersChange?: (filters: ProjectFilters) => void;
  } = {},
) {
  const onFiltersChange = options.onFiltersChange ?? vi.fn();
  // Distinguish "not provided" from "explicitly undefined" so the
  // renders-tabs-omit test can opt out.
  const onArchivedChange =
    'onArchivedChange' in options ? options.onArchivedChange : vi.fn();
  renderWithQC(
    <ToolbarHarness
      initial={options.initial}
      archived={options.archived}
      onArchivedChange={onArchivedChange}
      onFiltersChange={onFiltersChange}
    />,
  );
  return { onFiltersChange, onArchivedChange };
}

describe('ProjectsToolbar — filter controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewPrefData = undefined;
    rosterData = { members: [] };
  });

  it('renders search, scope tabs, view switch and filter pills in list mode', () => {
    renderHarness();

    // Search input (left)
    expect(screen.getByPlaceholderText('Find projects…')).toBeInTheDocument();

    // Active / Archived scope tabs
    expect(screen.getByRole('tab', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Archived' })).toBeInTheDocument();

    // View switch — List/Kanban icon tabs
    expect(screen.getByRole('tab', { name: 'List view' })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Kanban view' }),
    ).toBeInTheDocument();

    // Filter pills
    expect(
      screen.getByRole('button', { name: 'All statuses' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'All owners' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Any start' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Any target' }),
    ).toBeInTheDocument();
    // Sort shows the current `sort` label; direction is desc → "Sort ascending"
    expect(screen.getByRole('button', { name: 'Newest' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sort ascending' }),
    ).toBeInTheDocument();
  });

  it('defaults to List view when no preference exists yet', () => {
    renderHarness();

    expect(screen.getByRole('tab', { name: 'List view' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Kanban view' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('search input streams the query into onChange', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderHarness();

    await user.type(screen.getByPlaceholderText('Find projects…'), 'har');

    // The last keystroke arrives as the full accumulated value
    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'har' }),
    );
  });

  it('clicking the Kanban view persists via the set-view mutation', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole('tab', { name: 'Kanban view' }));

    expect(mockSetView).toHaveBeenCalledWith({
      scope: 'PROJECT',
      view: 'KANBAN',
    });
  });

  it('clicking the List view persists when currently in Kanban', async () => {
    viewPrefData = { view: 'KANBAN' };
    const user = userEvent.setup();
    renderHarness();

    expect(screen.getByRole('tab', { name: 'Kanban view' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(screen.getByRole('tab', { name: 'List view' }));
    expect(mockSetView).toHaveBeenCalledWith({
      scope: 'PROJECT',
      view: 'LIST',
    });
  });

  it('hides the status filter — but keeps owner/sort — in Kanban view', () => {
    viewPrefData = { view: 'KANBAN' };
    renderHarness();

    // Status is a list-only concept
    expect(screen.queryByRole('button', { name: 'All statuses' })).toBeNull();
    // The rest of the filter pills survive
    expect(
      screen.getByRole('button', { name: 'All owners' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Any start' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Newest' })).toBeInTheDocument();
  });

  it('status select patches `status` and All resets it', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderHarness();

    // Open the status select and pick Active
    await user.click(screen.getByRole('button', { name: 'All statuses' }));
    await user.click(screen.getByRole('option', { name: 'Active' }));
    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'ACTIVE' as ProjectStatus }),
    );

    // Real state applied — the pill now shows "Active"
    expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All statuses' })).toBeNull();

    // Switch back to All statuses → status cleared
    await user.click(screen.getByRole('button', { name: 'Active' }));
    await user.click(screen.getByRole('option', { name: 'All statuses' }));
    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: undefined }),
    );
  });

  it('owner select lists the roster and filters by user id', async () => {
    rosterData = {
      members: [
        member(),
        member({
          id: 'cm0mem0002',
          userId: 'usr_2',
          name: 'Alex Rivera',
          email: 'alex@harbor.test',
        }),
      ],
    };
    const user = userEvent.setup();
    const { onFiltersChange } = renderHarness();

    await user.click(screen.getByRole('button', { name: 'All owners' }));

    // Both roster names are present as options
    expect(
      screen.getByRole('option', { name: 'Yonatane Mekete' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Alex Rivera' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: 'Alex Rivera' }));
    // The list endpoint filters Project.ownerId (User.id), not the membership id
    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ ownerId: 'usr_2' }),
    );
  });

  it('sort select swaps the sort key and the direction button toggles order', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderHarness();

    // Change sort field
    await user.click(screen.getByRole('button', { name: 'Newest' }));
    await user.click(screen.getByRole('option', { name: 'Start date' }));
    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'startDate' }),
    );

    // Direction toggle — desc → asc (aria-label flips)
    await user.click(screen.getByRole('button', { name: 'Sort ascending' }));
    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ order: 'asc' }),
    );
  });

  it('Active/Archived scope toggle notifies the parent', async () => {
    const user = userEvent.setup();
    const { onArchivedChange } = renderHarness();

    await user.click(screen.getByRole('tab', { name: 'Archived' }));
    expect(onArchivedChange).toHaveBeenCalledWith(true);
  });

  it('archived prop drops view switch and all filter controls', () => {
    renderHarness({ archived: true });

    // Scope tabs still there, Archived selected
    expect(screen.getByRole('tab', { name: 'Archived' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // View switch + filter pills gone — the archived list is read-only
    expect(screen.queryByRole('tab', { name: 'List view' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Kanban view' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'All owners' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Any start' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Newest' })).toBeNull();
    // Search itself remains (it still filters the archived list)
    expect(screen.getByPlaceholderText('Find projects…')).toBeInTheDocument();
  });

  it('omits the scope tabs when onArchivedChange is not provided', () => {
    renderHarness({ onArchivedChange: undefined });

    expect(screen.queryByRole('tab', { name: 'Archived' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Active' })).toBeNull();
    // View switch unaffected
    expect(
      screen.getByRole('tab', { name: 'Kanban view' }),
    ).toBeInTheDocument();
  });
});
