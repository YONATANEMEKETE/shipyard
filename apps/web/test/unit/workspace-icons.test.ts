import { describe, it, expect } from 'vitest';

import { WORKSPACE_ICON_KEYS } from '@shipyard/shared';
import {
  getWorkspaceIcon,
  isWorkspaceIconKey,
  workspaceIconMap,
} from '@/lib/workspace/icons';

describe('workspace icons', () => {
  it('every WORKSPACE_ICON_KEYS entry has a Lucide component in the map', () => {
    const missing = WORKSPACE_ICON_KEYS.filter((k) => !(k in workspaceIconMap));
    expect(missing).toEqual([]);
  });

  it('map size matches WORKSPACE_ICON_KEYS length — no extras, no drift', () => {
    expect(Object.keys(workspaceIconMap)).toHaveLength(
      WORKSPACE_ICON_KEYS.length,
    );
  });

  it('getWorkspaceIcon returns a component for a known key', () => {
    expect(getWorkspaceIcon('rocket')).toBeTruthy();
    expect(getWorkspaceIcon('boxes')).toBeTruthy();
  });

  it('getWorkspaceIcon returns null for unknown, null, undefined, and empty', () => {
    expect(getWorkspaceIcon('not-a-key')).toBeNull();
    expect(getWorkspaceIcon(null)).toBeNull();
    expect(getWorkspaceIcon(undefined)).toBeNull();
    expect(getWorkspaceIcon('')).toBeNull();
  });

  it('isWorkspaceIconKey is true only for known keys', () => {
    expect(isWorkspaceIconKey('rocket')).toBe(true);
    expect(isWorkspaceIconKey('not-a-key')).toBe(false);
    expect(isWorkspaceIconKey(null)).toBe(false);
    expect(isWorkspaceIconKey(undefined)).toBe(false);
    expect(isWorkspaceIconKey('')).toBe(false);
  });
});
