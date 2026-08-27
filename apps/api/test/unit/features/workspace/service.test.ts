import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InternalServerError } from '../../../../src/common/errors/httpErrors.js';

const { workspaceRepositoryMock } = vi.hoisted(() => ({
  workspaceRepositoryMock: {
    createWithOwner: vi.fn(),
  },
}));

// Mock the repository so no database is involved: this suite pins the service's
// slug-collision retry contract (api-design.md §10.1 "retry logic test").
vi.mock('../../../../src/features/workspace/repository.js', () => ({
  workspaceRepository: workspaceRepositoryMock,
}));

import { workspaceService } from '../../../../src/features/workspace/service.js';

function uniqueViolation() {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
  });
}

const createdRow = {
  id: 'w1',
  slug: 'generated0a',
  name: 'Team',
  status: 'ACTIVE' as const,
  icon: null,
  archivedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('workspaceService.create slug retry', () => {
  beforeEach(() => {
    workspaceRepositoryMock.createWithOwner.mockReset();
  });

  it('retries with a fresh slug when creation hits a slug unique violation', async () => {
    workspaceRepositoryMock.createWithOwner
      .mockRejectedValueOnce(uniqueViolation())
      .mockResolvedValueOnce(createdRow);

    const detail = await workspaceService.create('u1', { name: 'Team' });

    expect(detail.slug).toBe('generated0a');
    expect(workspaceRepositoryMock.createWithOwner).toHaveBeenCalledTimes(2);
  });

  it('propagates non-unique-violation errors without retrying', async () => {
    workspaceRepositoryMock.createWithOwner.mockRejectedValueOnce(
      new Error('connection refused'),
    );

    await expect(
      workspaceService.create('u1', { name: 'Team' }),
    ).rejects.toThrow('connection refused');
    expect(workspaceRepositoryMock.createWithOwner).toHaveBeenCalledTimes(1);
  });

  it('fails with INTERNAL_SERVER_ERROR after exhausting the retry budget', async () => {
    workspaceRepositoryMock.createWithOwner.mockRejectedValue(
      uniqueViolation(),
    );

    await expect(
      workspaceService.create('u1', { name: 'Team' }),
    ).rejects.toBeInstanceOf(InternalServerError);
    // SLUG_MAX_TRIES attempts, then the error surfaces.
    expect(workspaceRepositoryMock.createWithOwner).toHaveBeenCalledTimes(5);
  });
});
