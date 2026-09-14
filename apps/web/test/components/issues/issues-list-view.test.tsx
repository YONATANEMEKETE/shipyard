import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IssueCard, LabelCard } from '@shipyard/shared';
import { describe, expect, it, vi } from 'vitest';

import { IssuesListView } from '@/components/issues/issues-list-view';

function label(id: string, name: string): LabelCard {
  return { id, workspaceId: 'ws_1', name, color: '#b45309' };
}

function issue(overrides: Partial<IssueCard> = {}): IssueCard {
  return {
    id: 'iss_1',
    workspaceId: 'ws_1',
    seqNumber: 1,
    identifier: 'SHIP-1',
    title: 'First issue',
    status: 'TODO',
    priority: 'MEDIUM',
    assignee: null,
    projectId: null,
    cycleId: null,
    dueDate: null,
    blocked: false,
    blockedReason: null,
    labels: [],
    archivedAt: null,
    createdAt: '2026-12-02T14:32:00.000Z',
    updatedAt: '2026-12-02T14:32:00.000Z',
    ...overrides,
  };
}

describe('IssuesListView — rows', () => {
  it('groups issues by status, in board order', () => {
    render(
      <IssuesListView
        issues={[
          issue({
            id: 'a',
            identifier: 'SHIP-1',
            title: 'Backlog one',
            status: 'BACKLOG',
          }),
          issue({
            id: 'b',
            identifier: 'SHIP-2',
            title: 'Doing one',
            status: 'IN_PROGRESS',
          }),
          issue({
            id: 'c',
            identifier: 'SHIP-3',
            title: 'Todo one',
            status: 'TODO',
          }),
        ]}
      />,
    );

    const sections = screen.getAllByRole('region');
    expect(sections.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Backlog',
      'Todo',
      'In Progress',
    ]);
    // Each row carries its identifier and title.
    expect(screen.getByText('SHIP-2')).toBeInTheDocument();
    expect(screen.getByText('Doing one')).toBeInTheDocument();
  });

  it('collapses a group without dropping its rows from the data', async () => {
    const user = userEvent.setup();
    render(<IssuesListView issues={[issue({ title: 'Toggle me' })]} />);

    // `/^Todo/` skips the group's own "New Todo issue" action.
    const header = screen.getByRole('button', { name: /^Todo/ });
    expect(header).toHaveAttribute('aria-expanded', 'true');

    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    // The rows ride out the exit animation before unmounting.
    await waitFor(() => expect(screen.queryByText('Toggle me')).toBeNull());
  });

  it('opens the issue from its row', async () => {
    const user = userEvent.setup();
    const onOpenIssue = vi.fn();
    render(<IssuesListView issues={[issue()]} onOpenIssue={onOpenIssue} />);

    await user.click(screen.getByRole('button', { name: /First issue/ }));
    expect(onOpenIssue).toHaveBeenCalledTimes(1);
    expect(onOpenIssue.mock.calls[0]![0]).toMatchObject({ id: 'iss_1' });
  });

  it('flags an overdue due date', () => {
    render(
      <IssuesListView
        issues={[issue({ dueDate: '2020-01-01', title: 'Late one' })]}
      />,
    );

    expect(screen.getByText('Jan 1')).toHaveClass('text-ds-danger');
  });
});

describe('IssuesListView — label overflow', () => {
  it('caps visible labels and counts the rest', () => {
    render(
      <IssuesListView
        issues={[
          issue({
            labels: [
              label('l1', 'backend'),
              label('l2', 'frontend'),
              label('l3', 'bug'),
              label('l4', 'regression'),
            ],
          }),
        ]}
      />,
    );

    // Two pills plus a count — the row can never be widened by a label list.
    expect(screen.getByText('backend')).toBeInTheDocument();
    expect(screen.getByText('frontend')).toBeInTheDocument();
    expect(screen.queryByText('bug')).toBeNull();

    const overflow = screen.getByText('+2');
    expect(overflow).toBeInTheDocument();
    // The hidden names are still reachable from the count.
    expect(overflow).toHaveAttribute('title', 'bug, regression');
  });

  it('shows no count when every label fits', () => {
    render(
      <IssuesListView
        issues={[
          issue({ labels: [label('l1', 'backend'), label('l2', 'bug')] }),
        ]}
      />,
    );

    expect(screen.getByText('backend')).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d/)).toBeNull();
  });

  it('keeps every label pill within a capped width', () => {
    render(
      <IssuesListView
        issues={[
          issue({ labels: [label('l1', 'a-very-long-label-name-indeed')] }),
        ]}
      />,
    );

    // The name truncates inside the pill instead of stretching the row.
    expect(
      screen.getByText('a-very-long-label-name-indeed'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('a-very-long-label-name-indeed').parentElement,
    ).toHaveClass('max-w-[96px]');
  });
});

describe('IssuesListView — states', () => {
  it('centers a loading spinner', () => {
    render(<IssuesListView issues={[]} loading />);
    expect(screen.getByLabelText('Loading issues')).toBeInTheDocument();
  });

  it('offers a retry on error', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<IssuesListView issues={[]} error onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('distinguishes an empty workspace from an empty filter result', () => {
    const { rerender } = render(<IssuesListView issues={[]} />);
    expect(screen.getByText('No issues yet')).toBeInTheDocument();

    rerender(<IssuesListView issues={[]} hasActiveFilters />);
    expect(screen.getByText('No issues match')).toBeInTheDocument();
  });

  it('offers a per-group add action and skips it for Done', async () => {
    const user = userEvent.setup();
    const onAddIssue = vi.fn();
    render(
      <IssuesListView
        issues={[
          issue({ id: 'a', status: 'TODO' }),
          issue({ id: 'b', identifier: 'SHIP-2', status: 'DONE' }),
        ]}
        onAddIssue={onAddIssue}
      />,
    );

    const todoGroup = screen.getByRole('region', { name: 'Todo' });
    await user.click(
      within(todoGroup).getByRole('button', { name: 'New Todo issue' }),
    );
    expect(onAddIssue).toHaveBeenCalledWith('TODO');

    const doneGroup = screen.getByRole('region', { name: 'Done' });
    expect(
      within(doneGroup).queryByRole('button', { name: /New Done issue/ }),
    ).toBeNull();
  });
});
