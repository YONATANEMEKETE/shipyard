import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IssuesToolbar,
  type IssueFilters,
} from '@/components/issues/issues-toolbar';

// ── Hook mocks — the toolbar consumes roster/projects/labels/view-pref and
//    the blocked filter needs none of them populated. Mirrors the
//    projects-toolbar suite. ────────────────────────────────────────────────
vi.mock('@/hooks/use-projects', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-projects')>(
    '@/hooks/use-projects',
  );
  return {
    ...actual,
    useViewPreference: () => ({ data: undefined }),
    useSetViewPreference: () => ({ mutate: vi.fn(), isPending: false }),
    useProjects: () => ({ data: { projects: [] } }),
  };
});

vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({ data: { members: [] }, isPending: false }),
}));

vi.mock('@/hooks/use-issues', async () => {
  const actual =
    await vi.importActual<typeof import('@/hooks/use-issues')>(
      '@/hooks/use-issues',
    );
  return {
    ...actual,
    useLabels: () => ({ data: { labels: [] } }),
  };
});

function baseFilters(overrides: Partial<IssueFilters> = {}): IssueFilters {
  return { search: '', order: 'desc', ...overrides };
}

function renderWithQC(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

/** Parent-owned filter state, exactly like IssuesPage drives the toolbar. */
function ToolbarHarness({
  initial = baseFilters(),
  onFiltersChange,
}: {
  initial?: IssueFilters;
  onFiltersChange?: (filters: IssueFilters) => void;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <IssuesToolbar
      slug="acme"
      filters={filters}
      onChange={(next) => {
        onFiltersChange?.(next);
        setFilters(next);
      }}
    />
  );
}

function renderHarness(initial?: IssueFilters) {
  const onFiltersChange = vi.fn();
  renderWithQC(
    <ToolbarHarness initial={initial} onFiltersChange={onFiltersChange} />,
  );
  return { onFiltersChange };
}

/**
 * The blocked filter is the only discovery path for blocked issues now that
 * there is no dedicated Blocked screen — the flag is a badge on rows and
 * Kanban cards (design decision), so the pill is what makes it findable.
 */
describe('IssuesToolbar — blocked filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the blocked pill alongside the other filters', () => {
    renderHarness();
    expect(screen.getByRole('button', { name: 'Blocked' })).toBeInTheDocument();
  });

  it("filters to blocked only with 'true'", async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderHarness();

    await user.click(screen.getByRole('button', { name: 'Blocked' }));
    await user.click(screen.getByRole('option', { name: 'Blocked' }));

    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ blocked: 'true' }),
    );
  });

  it("can invert to not-blocked with 'false'", async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderHarness();

    await user.click(screen.getByRole('button', { name: 'Blocked' }));
    await user.click(screen.getByRole('option', { name: 'Not blocked' }));

    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ blocked: 'false' }),
    );
  });

  it('treats the any-state option as no filter at all', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderHarness(baseFilters({ blocked: 'true' }));

    await user.click(screen.getByRole('button', { name: 'Blocked' }));
    await user.click(screen.getByRole('option', { name: 'Any blocked state' }));

    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ blocked: undefined }),
    );
  });

  it('Clear resets the blocked filter too', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderHarness(
      baseFilters({ blocked: 'true', priority: 'URGENT' }),
    );

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ blocked: undefined, priority: undefined }),
    );
  });
});
