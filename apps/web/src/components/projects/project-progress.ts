import type { ProjectCard } from '@shipyard/shared';

/**
 * Display progress for a project row/panel.
 *
 * The API derives `{ total, completed, percent }` from non-archived issue
 * counts (`percent` is null when the project tracks no issues). Display
 * rules on top of that:
 *  - COMPLETED projects read 100% regardless of issue counts.
 *  - Projects with no tracked issues read 0%, never a dash.
 */
export function displayProgress(
  project: Pick<ProjectCard, 'status' | 'progress'>,
): number {
  if (project.status === 'COMPLETED') return 100;
  return project.progress.percent ?? 0;
}
