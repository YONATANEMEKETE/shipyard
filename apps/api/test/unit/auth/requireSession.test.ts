import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../../../src/common/errors/httpErrors.js';

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock('../../../src/lib/auth.js', () => ({
  auth: { api: { getSession: getSessionMock } },
}));

// Import after mock
const { requireSession } =
  await import('../../../src/common/middlewares/requireSession.js');

function mockReq(
  headers: Record<string, string | string[] | undefined> = {},
): Request {
  return {
    headers,
    // session/user are added by the middleware
  } as unknown as Request;
}

function mockRes(): Response {
  return {} as unknown as Response;
}

describe('requireSession', () => {
  let next: NextFunction & { mock: { calls: unknown[][] } };

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    next = vi.fn() as unknown as NextFunction & {
      mock: { calls: unknown[][] };
    };
  });

  it('attaches session and user when a session exists', async () => {
    const session = { id: 'sess_123', userId: 'user_123' };
    const user = { id: 'user_123', email: 'test@example.com' };
    getSessionMock.mockResolvedValue({ session, user });

    const req = mockReq({ cookie: 'better-auth.session_token=abc' });
    const res = mockRes();

    await requireSession(req, res, next);

    expect(getSessionMock).toHaveBeenCalledOnce();
    const firstCall = getSessionMock.mock.calls[0]?.[0] as unknown as {
      headers: Headers;
    };
    const headersArg = firstCall.headers;
    expect(headersArg.get('cookie')).toBe('better-auth.session_token=abc');
    expect(req.session).toEqual(session);
    expect(req.user).toEqual(user);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });

  it('forwards an UnauthorizedError when no session is found', async () => {
    getSessionMock.mockResolvedValue(null);

    const req = mockReq();
    const res = mockRes();

    await requireSession(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect((error as UnauthorizedError).statusCode).toBe(401);
  });

  it('forwards header arrays correctly', async () => {
    const session = { id: 'sess_1' };
    const user = { id: 'user_1' };
    getSessionMock.mockResolvedValue({ session, user });

    const req = mockReq({ 'x-forwarded-for': ['1.1.1.1', '2.2.2.2'] });
    const res = mockRes();

    await requireSession(req, res, next);

    const firstCall = getSessionMock.mock.calls[0]?.[0] as unknown as {
      headers: Headers;
    };
    const headersArg = firstCall.headers;
    // Headers.append joins with comma — verify both values survive
    expect(headersArg.get('x-forwarded-for')).toBe('1.1.1.1, 2.2.2.2');
    expect(next).toHaveBeenCalledWith();
  });

  it('forwards errors from getSession to next', async () => {
    const thrown = new Error('db down');
    getSessionMock.mockRejectedValue(thrown);

    const req = mockReq();
    const res = mockRes();

    await requireSession(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(thrown);
  });
});
