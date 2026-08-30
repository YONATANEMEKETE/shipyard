import { describe, it, expect, vi, beforeEach } from 'vitest';

import { isArchived } from '@/lib/workspace/is-archived';
import {
  canViewArchived,
  getWorkspaceRole,
  isOwner,
} from '@/lib/workspace/role';
import {
  clearSelectedWorkspace,
  getSelectedWorkspace,
  SELECTED_WORKSPACE_KEY,
  setSelectedWorkspace,
} from '@/lib/workspace/selected-workspace';
import type { WorkspaceCard } from '@shipyard/shared';

describe('isArchived', () => {
  it('returns false for null, undefined, and empty string', () => {
    expect(isArchived(null)).toBe(false);
    expect(isArchived(undefined)).toBe(false);
    expect(isArchived('')).toBe(false);
  });

  it('returns true only for the string ARCHIVED', () => {
    expect(isArchived('ARCHIVED')).toBe(true);
    expect(isArchived('ACTIVE')).toBe(false);
    expect(isArchived('archived')).toBe(false);
  });

  it('returns true when object status is ARCHIVED, false otherwise', () => {
    expect(isArchived({ status: 'ARCHIVED' })).toBe(true);
    expect(isArchived({ status: 'ACTIVE' })).toBe(false);
  });

  it('returns false for object with falsy or non-archived status', () => {
    expect(isArchived({ status: '' } as unknown as { status: string })).toBe(
      false,
    );
  });
});

describe('selected-workspace localStorage helpers', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    const storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        store = {};
      },
      get length() {
        return Object.keys(store).length;
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
    } as unknown as Storage;

    Object.defineProperty(window, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('getSelectedWorkspace returns null when nothing stored', () => {
    expect(getSelectedWorkspace()).toBeNull();
  });

  it('set then get round-trips the slug', () => {
    setSelectedWorkspace('my-workspace');
    expect(window.localStorage.getItem(SELECTED_WORKSPACE_KEY)).toBe(
      'my-workspace',
    );
    expect(getSelectedWorkspace()).toBe('my-workspace');
  });

  it('clearSelectedWorkspace removes the stored slug', () => {
    setSelectedWorkspace('to-clear');
    clearSelectedWorkspace();
    expect(getSelectedWorkspace()).toBeNull();
    expect(window.localStorage.getItem(SELECTED_WORKSPACE_KEY)).toBeNull();
  });

  it('returns null and swallows error when localStorage throws on get', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(getSelectedWorkspace()).toBeNull();
  });

  it('swallows error when localStorage throws on set and clear', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => setSelectedWorkspace('x')).not.toThrow();
    expect(() => clearSelectedWorkspace()).not.toThrow();
  });
});

describe('role helpers', () => {
  it('isOwner returns true only for OWNER', () => {
    expect(isOwner('OWNER')).toBe(true);
    expect(isOwner('MEMBER')).toBe(false);
    expect(isOwner('ADMIN')).toBe(false);
    expect(isOwner('')).toBe(false);
  });

  it('canViewArchived mirrors isOwner — only Owner can view archived', () => {
    expect(canViewArchived('OWNER')).toBe(true);
    expect(canViewArchived('MEMBER')).toBe(false);
    expect(canViewArchived('ADMIN')).toBe(false);
  });

  it('getWorkspaceRole returns role for matching slug and null otherwise', () => {
    const workspaces = [
      { slug: 'alpha', role: 'OWNER' },
      { slug: 'beta', role: 'MEMBER' },
    ] as unknown as WorkspaceCard[];

    expect(getWorkspaceRole(workspaces, 'alpha')).toBe('OWNER');
    expect(getWorkspaceRole(workspaces, 'beta')).toBe('MEMBER');
    expect(getWorkspaceRole(workspaces, 'missing')).toBeNull();
    expect(getWorkspaceRole([], 'alpha')).toBeNull();
  });
});
