import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProjectCard } from '@shipyard/shared';
import { describe, expect, it, vi } from 'vitest';

import { ProjectsTable } from '@/components/projects/projects-table';

/** Matches the table's own formatter (day-precision dates render via a noon
 *  anchor so TZ shifts never move the day). */
function formatDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function project(overrides: Partial<ProjectCard> = {}): ProjectCard {
  return {
    id: 'cm0prj0001',
    workspaceId: 'ws_1',
    name: 'Harbor Launch',
    status: 'ACTIVE',
    owner: {
      memberId: 'cm0mem0001',
      userId: 'usr_1',
      name: 'Yonatane Mekete',
      email: 'yonatane@harbor.test',
      image: null,
    },
    description: null,
    startDate: '2026-08-12',
    targetDate: '2026-11-30',
    archivedAt: null,
    createdAt: '2026-08-12T09:00:00.000Z',
    updatedAt: '2026-08-12T09:00:00.000Z',
    ...overrides,
  };
}

describe('ProjectsTable — list states', () => {
  it('renders rows with project name, owner, status pill and dates', () => {
    render(
      <ProjectsTable
        projects={[
          project(),
          project({
            id: 'cm0prj0002',
            name: 'Fleet Diagnostics',
            status: 'COMPLETED',
            owner: {
              memberId: 'cm0mem0002',
              userId: 'usr_2',
              name: 'Alex Rivera',
              email: 'alex@harbor.test',
              image: null,
            },
            startDate: '2026-06-01',
            targetDate: '2026-09-15',
          }),
          project({
            id: 'cm0prj0003',
            name: 'Dry Dock',
            status: 'PLANNED',
            owner: {
              memberId: 'cm0mem0003',
              userId: 'usr_3',
              name: 'Jordan Lee',
              email: 'jordan@harbor.test',
              image: null,
            },
            startDate: null,
            targetDate: null,
          }),
        ]}
      />,
    );

    // Project names + owner names
    expect(screen.getByText('Harbor Launch')).toBeInTheDocument();
    expect(screen.getByText('Fleet Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('Dry Dock')).toBeInTheDocument();
    expect(screen.getByText('Yonatane Mekete')).toBeInTheDocument();
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();

    // Status pills for the three statuses
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Planned')).toBeInTheDocument();

    // Formatted day-precision dates
    expect(screen.getByText(formatDate('2026-08-12'))).toBeInTheDocument();
    expect(screen.getByText(formatDate('2026-11-30'))).toBeInTheDocument();
    expect(screen.getByText(formatDate('2026-06-01'))).toBeInTheDocument();
    // Missing dates render the em-dash placeholder (one per cell)
    expect(screen.getAllByText('—')).toHaveLength(2);

    // Column header strip is present
    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('Target')).toBeInTheDocument();

    // Footer derives from the real list
    expect(screen.getByText(/showing 1–3 of 3 projects/i)).toBeInTheDocument();
  });

  it('renders an image avatar when the owner has one, initials otherwise', () => {
    render(
      <ProjectsTable
        projects={[
          project({
            owner: {
              memberId: 'cm0mem0001',
              userId: 'usr_1',
              name: 'Yonatane Mekete',
              email: 'yonatane@harbor.test',
              image: 'https://cdn.example.test/avatars/yona.png',
            },
          }),
          project({
            id: 'cm0prj0002',
            name: 'Fleet Diagnostics',
            owner: {
              memberId: 'cm0mem0002',
              userId: 'usr_2',
              name: 'Alex Rivera',
              email: 'alex@harbor.test',
              image: null,
            },
          }),
        ]}
      />,
    );

    const avatar = document.querySelector('img');
    expect(avatar).toHaveAttribute(
      'src',
      'https://cdn.example.test/avatars/yona.png',
    );
    // Alex has no image → initials fallback
    expect(screen.getByText('AR')).toBeInTheDocument();
    // Yonatane has an image, so no initials for that row
    expect(screen.queryByText('YM')).not.toBeInTheDocument();
  });

  it('renders row skeletons while loading and no roster rows', () => {
    render(<ProjectsTable projects={[]} loading />);

    expect(screen.getAllByTestId('project-row-skeleton')).toHaveLength(12);
    expect(screen.queryByText('Harbor Launch')).not.toBeInTheDocument();
    expect(screen.queryByText(/no projects yet/i)).not.toBeInTheDocument();
  });

  it('renders the empty state when the list is empty', () => {
    render(<ProjectsTable projects={[]} />);

    expect(screen.getByText('No projects yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Create your first project to start tracking initiatives.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('project-row-skeleton'),
    ).not.toBeInTheDocument();
  });

  it('renders a custom empty state when filters are active', () => {
    render(
      <ProjectsTable
        projects={[]}
        emptyTitle="No projects match"
        emptyDescription="Try a different name — or clear the search."
      />,
    );

    expect(screen.getByText('No projects match')).toBeInTheDocument();
    expect(
      screen.getByText('Try a different name — or clear the search.'),
    ).toBeInTheDocument();
    // Default copy is replaced, not stacked
    expect(
      screen.queryByText(
        'Create your first project to start tracking initiatives.',
      ),
    ).not.toBeInTheDocument();
  });

  it('renders the error state with retry and calls onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(<ProjectsTable projects={[]} error onRetry={onRetry} />);

    expect(screen.getByText(/couldn't load projects/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows no retry button when onRetry is not provided', () => {
    render(<ProjectsTable projects={[]} error />);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('pages long lists client-side: 12 per page, next/prev + footer', async () => {
    const user = userEvent.setup();
    const projects = Array.from({ length: 13 }, (_, index) =>
      project({ id: `cm0prj${String(index + 1).padStart(4, '0')}` }),
    );

    render(<ProjectsTable projects={projects} />);

    // First page — rows 1–12, footer reflects the slice
    expect(
      screen.getByText(/showing 1–12 of 13 projects/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Previous page' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(
      screen.getByText(/showing 13–13 of 13 projects/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Page 1' }));
    expect(
      screen.getByText(/showing 1–12 of 13 projects/i),
    ).toBeInTheDocument();
  });

  it('collapses an overflowing page list with an ellipsis', async () => {
    const user = userEvent.setup();
    // 60 projects → 5 pages: compact page list on page 1 is 1, 2, … , 5
    const projects = Array.from({ length: 60 }, (_, index) =>
      project({ id: `cm0prj${String(index + 1).padStart(4, '0')}` }),
    );

    render(<ProjectsTable projects={projects} />);

    expect(
      screen.getByText(/showing 1–12 of 60 projects/i),
    ).toBeInTheDocument();
    expect(screen.getByText('…')).toBeInTheDocument();
    // Page 2 is adjacent to the current page; page 5 is the last
    expect(screen.getByRole('button', { name: 'Page 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 5' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Page 5' }));
    expect(
      screen.getByText(/showing 49–60 of 60 projects/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 5' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('calls onOpenProject when a row is clicked', async () => {
    const user = userEvent.setup();
    const onOpenProject = vi.fn();
    const target = project({ id: 'cm0prj0042', name: 'Harbor Launch' });

    render(<ProjectsTable projects={[target]} onOpenProject={onOpenProject} />);

    await user.click(screen.getByText('Harbor Launch'));
    expect(onOpenProject).toHaveBeenCalledTimes(1);
    expect(onOpenProject).toHaveBeenCalledWith(target);
  });

  it('calls onOpenProject when the row chevron button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenProject = vi.fn();
    const target = project({ id: 'cm0prj0042', name: 'Harbor Launch' });

    render(<ProjectsTable projects={[target]} onOpenProject={onOpenProject} />);

    await user.click(
      screen.getByRole('button', { name: 'Open Harbor Launch' }),
    );
    expect(onOpenProject).toHaveBeenCalledWith(target);
  });
});
