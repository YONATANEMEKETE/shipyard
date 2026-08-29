export const SELECTED_WORKSPACE_KEY = 'selected-workspace';

export function getSelectedWorkspace(): string | null {
  try {
    return localStorage.getItem(SELECTED_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

export function setSelectedWorkspace(slug: string): void {
  try {
    localStorage.setItem(SELECTED_WORKSPACE_KEY, slug);
  } catch {}
}

export function clearSelectedWorkspace(): void {
  try {
    localStorage.removeItem(SELECTED_WORKSPACE_KEY);
  } catch {}
}
