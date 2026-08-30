import type { WorkspaceStatus } from '@shipyard/shared';

type WithStatus = { status: WorkspaceStatus | string } | null | undefined;

export function isArchived(workspace: WithStatus): boolean;
export function isArchived(
  status: WorkspaceStatus | string | null | undefined,
): boolean;
export function isArchived(
  workspaceOrStatus: WithStatus | WorkspaceStatus | string | null | undefined,
): boolean {
  if (!workspaceOrStatus) return false;
  if (typeof workspaceOrStatus === 'string')
    return workspaceOrStatus === 'ARCHIVED';
  return workspaceOrStatus.status === 'ARCHIVED';
}
