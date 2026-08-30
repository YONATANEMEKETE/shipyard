import type { WorkspaceCard, WorkspaceRole } from '@shipyard/shared';

export function isOwner(role: string): boolean {
  return role === 'OWNER';
}

export function canViewArchived(role: string): boolean {
  return isOwner(role);
}

export function getWorkspaceRole(
  workspaces: WorkspaceCard[],
  slug: string,
): WorkspaceRole | null {
  return workspaces.find((w) => w.slug === slug)?.role ?? null;
}
