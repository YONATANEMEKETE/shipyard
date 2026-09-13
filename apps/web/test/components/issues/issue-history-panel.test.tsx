import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IssueHistoryCard, LabelCard } from '@shipyard/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IssueHistoryPanel } from '@/components/issues/issue-history-panel';

// ── Hook mocks — the panel resolves raw history ids against workspace
//    lookups; stub all five hooks like the toolbar suites do. ──────────────
const mockRefetch = vi.fn();
const mockFetchNextPage = vi.fn();
/** Pages exactly as the API returns them — the panel flattens them to render. */
let historyPages: { history: IssueHistoryCard[]; nextCursor: string | null }[] =
  [];
let historyPending = false;
let historyError = false;
let hasNextPage = false;
let fetchingNextPage = false;

vi.mock('@/hooks/use-issues', () => ({
  useInfiniteIssueHistory: () => ({
    data: historyPending || historyError ? undefined : { pages: historyPages },
    isPending: historyPending,
    isError: historyError,
    refetch: mockRefetch,
    hasNextPage,
    isFetchingNextPage: fetchingNextPage,
    fetchNextPage: mockFetchNextPage,
  }),
  useLabels: () => ({
    data: {
      labels: [
        {
          id: 'lbl_1',
          workspaceId: 'ws_1',
          name: 'bug',
          color: '#b42318',
        } satisfies LabelCard,
      ],
    },
  }),
}));

vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({
    data: {
      members: [{ userId: 'usr_2', name: 'Ana Ruiz', image: null }],
    },
  }),
}));

vi.mock('@/hooks/use-projects', () => ({
  useProjects: () => ({
    data: { projects: [{ id: 'prj_1', name: 'Northwind Vault' }] },
  }),
}));

vi.mock('@/hooks/use-cycles', () => ({
  useCycles: () => ({ data: { cycles: [{ id: 'cyc_1', name: 'Cycle 4' }] } }),
}));

function entry(overrides: Partial<IssueHistoryCard>): IssueHistoryCard {
  return {
    id: `hist_${Math.random().toString(36).slice(2, 8)}`,
    event: 'CREATED',
    actor: {
      userId: 'usr_1',
      name: 'Yonatane Mekete',
      email: 'yonatane@harbor.test',
      image: null,
    },
    oldValue: null,
    newValue: null,
    createdAt: '2026-11-28T09:02:00.000Z',
    ...overrides,
  };
}

function renderPanel() {
  return render(<IssueHistoryPanel slug="acme" issueId="iss_1" />);
}

beforeEach(() => {
  historyPages = [];
  historyPending = false;
  historyError = false;
  hasNextPage = false;
  fetchingNextPage = false;
  mockRefetch.mockReset();
  mockFetchNextPage.mockReset();
});

describe('IssueHistoryPanel — fault states', () => {
  it('shows the centered loader while the timeline resolves', () => {
    historyPending = true;
    renderPanel();
    expect(
      screen.getByRole('status', { name: /loading issue history/i }),
    ).toBeInTheDocument();
  });

  it('shows the error state with a working retry', async () => {
    historyError = true;
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByText("Couldn't load history")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the empty state when nothing was recorded', () => {
    historyPages = [{ history: [], nextCursor: null }];
    renderPanel();
    expect(screen.getByText('No history yet')).toBeInTheDocument();
  });
});

describe('IssueHistoryPanel — timeline copy', () => {
  it('renders actor, action, old → new pills and the raw event type', () => {
    historyPages = [
      {
        history: [
          entry({
            event: 'STATUS_CHANGED',
            oldValue: 'BACKLOG',
            newValue: 'TODO',
          }),
        ],
        nextCursor: null,
      },
    ];
    renderPanel();

    expect(screen.getByText('Yonatane Mekete')).toBeInTheDocument();
    expect(screen.getByText('moved status')).toBeInTheDocument();
    expect(screen.getByText('Backlog')).toBeInTheDocument();
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByText('STATUS_CHANGED')).toBeInTheDocument();
    expect(
      screen.getByText('Showing 1 event • oldest first'),
    ).toBeInTheDocument();
  });

  it('resolves id-valued rows to workspace names', () => {
    historyPages = [
      {
        history: [
          entry({ event: 'ASSIGNED', newValue: 'usr_2' }),
          entry({
            event: 'PROJECT_CHANGED',
            oldValue: null,
            newValue: 'prj_1',
          }),
          entry({ event: 'CYCLE_CHANGED', oldValue: 'cyc_1', newValue: null }),
        ],
        nextCursor: null,
      },
    ];
    renderPanel();

    // Assignee pill carries the member's name, not the cuid.
    expect(screen.getByText('Ana Ruiz')).toBeInTheDocument();
    // Project moves read old → new, with "No project" for the null side.
    expect(screen.getByText('Northwind Vault')).toBeInTheDocument();
    expect(screen.getByText('No project')).toBeInTheDocument();
    // Cycle pills keep the departed cycle on the old side.
    expect(screen.getByText('Cycle 4')).toBeInTheDocument();
    expect(screen.getByText('No cycle')).toBeInTheDocument();
  });

  it('renders label and block-reason pills inline with the action', () => {
    historyPages = [
      {
        history: [
          entry({ event: 'LABEL_ADDED', newValue: 'lbl_1' }),
          entry({ event: 'BLOCKED_SET', newValue: 'Waiting on IdP fix' }),
        ],
        nextCursor: null,
      },
    ];
    renderPanel();

    expect(screen.getByText('added label')).toBeInTheDocument();
    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(screen.getByText('marked as blocked')).toBeInTheDocument();
    expect(screen.getByText('Waiting on IdP fix')).toBeInTheDocument();
  });

  it('says so when the page is not the whole story', () => {
    historyPages = [
      {
        history: [entry({ event: 'CREATED' }), entry({ event: 'ARCHIVED' })],
        nextCursor: 'cursor_2',
      },
    ];
    hasNextPage = true;
    renderPanel();

    const footer = screen.getByText(/oldest first/);
    expect(footer).toHaveTextContent(
      'Showing the first 2 events • oldest first',
    );
    // Oldest-first is the API order — the timeline must not reverse it.
    const panel = footer.closest('div')?.parentElement as HTMLElement;
    const created = within(panel).getByText('CREATED');
    const archived = within(panel).getByText('ARCHIVED');
    expect(
      created.compareDocumentPosition(archived) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('IssueHistoryPanel — manual pagination', () => {
  it('offers no control once the timeline is complete', () => {
    historyPages = [
      { history: [entry({ event: 'CREATED' })], nextCursor: null },
    ];
    renderPanel();

    expect(
      screen.queryByRole('button', { name: /show more events/i }),
    ).toBeNull();
  });

  it('only asks for the next page when the reader clicks', async () => {
    const user = userEvent.setup();
    historyPages = [
      { history: [entry({ event: 'CREATED' })], nextCursor: 'cursor_2' },
    ];
    hasNextPage = true;
    renderPanel();

    expect(mockFetchNextPage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /show more events/i }));
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('swaps the control for a busy label while the next page is in flight', () => {
    historyPages = [
      { history: [entry({ event: 'CREATED' })], nextCursor: 'cursor_2' },
    ];
    hasNextPage = true;
    fetchingNextPage = true;
    renderPanel();

    // StatefulButton owns the beat: label swaps, spinner rides the icon slot,
    // and the control locks while the page is outstanding.
    const button = screen.getByRole('button', { name: /loading/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Show more events')).toBeNull();
  });

  it('renders every loaded page and counts them in the footer', () => {
    historyPages = [
      {
        history: [entry({ event: 'CREATED' }), entry({ event: 'ARCHIVED' })],
        nextCursor: 'cursor_2',
      },
      { history: [entry({ event: 'RESTORED' })], nextCursor: null },
    ];
    renderPanel();

    expect(screen.getByText('CREATED')).toBeInTheDocument();
    expect(screen.getByText('ARCHIVED')).toBeInTheDocument();
    expect(screen.getByText('RESTORED')).toBeInTheDocument();
    expect(
      screen.getByText('Showing 3 events • oldest first'),
    ).toBeInTheDocument();
  });
});
