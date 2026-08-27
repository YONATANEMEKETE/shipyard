import { describe, it, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { requireWorkspaceRole } from '../../../src/common/guards/require-workspace-role.js';
import { ForbiddenRoleError } from '../../../src/features/workspace/errors.js';

function makeRequest(context: unknown): Request {
  return { workspaceContext: context } as unknown as Request;
}

function makeResponse(): Response {
  return {} as unknown as Response;
}

function makeNext() {
  const spy = vi.fn<(err?: unknown) => void>();
  const next = spy as unknown as NextFunction;
  return { next, calls: spy.mock.calls };
}

describe('requireWorkspaceRole', () => {
  it('allows a caller whose membership role is OWNER', () => {
    const { next, calls } = makeNext();
    requireWorkspaceRole('OWNER')(
      makeRequest({ role: 'OWNER' }),
      makeResponse(),
      next,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([]);
  });

  it('rejects with FORBIDDEN_ROLE when the role does not match', () => {
    const { next, calls } = makeNext();
    requireWorkspaceRole('OWNER')(
      makeRequest({ role: 'MEMBER' }),
      makeResponse(),
      next,
    );
    expect(calls[0]![0]).toBeInstanceOf(ForbiddenRoleError);
  });

  it('rejects with FORBIDDEN_ROLE when no context is resolved', () => {
    const { next, calls } = makeNext();
    requireWorkspaceRole('OWNER')(makeRequest(undefined), makeResponse(), next);
    expect(calls[0]![0]).toBeInstanceOf(ForbiddenRoleError);
  });
});
