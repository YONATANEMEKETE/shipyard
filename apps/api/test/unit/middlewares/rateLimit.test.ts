import { describe, it, expect, vi } from 'vitest';
import type { Request } from 'express';
import {
  isAuthPath,
  isOptionsRequest,
  skipApiRateLimit,
  skipOptionsRequests,
  rateLimitHandler,
  rateLimitLogger,
} from '../../../src/common/middlewares/rateLimit.js';
import { RateLimitError } from '../../../src/common/errors/httpErrors.js';

function req(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/api/v1/test',
    ...overrides,
  } as unknown as Request;
}

describe('rateLimit helpers', () => {
  it('isOptionsRequest identifies OPTIONS', () => {
    expect(isOptionsRequest(req({ method: 'OPTIONS' }))).toBe(true);
    expect(isOptionsRequest(req({ method: 'GET' }))).toBe(false);
  });

  it('isAuthPath matches /api/v1/auth and subpaths, ignoring query', () => {
    expect(isAuthPath(req({ originalUrl: '/api/v1/auth' }))).toBe(true);
    expect(isAuthPath(req({ originalUrl: '/api/v1/auth/' }))).toBe(true);
    expect(isAuthPath(req({ originalUrl: '/api/v1/auth/sign-in/email' }))).toBe(
      true,
    );
    expect(
      isAuthPath(req({ originalUrl: '/api/v1/auth/sign-in/email?foo=bar' })),
    ).toBe(true);
    expect(isAuthPath(req({ originalUrl: '/api/v1/other' }))).toBe(false);
    expect(isAuthPath(req({ originalUrl: '/api/v1/auth-other' }))).toBe(false);
  });

  it('skipOptionsRequests skips only OPTIONS', async () => {
    const res = {} as unknown as import('express').Response;
    expect(await skipOptionsRequests(req({ method: 'OPTIONS' }), res)).toBe(
      true,
    );
    expect(await skipOptionsRequests(req({ method: 'GET' }), res)).toBe(false);
  });

  it('skipApiRateLimit skips OPTIONS and auth paths', async () => {
    const res = {} as unknown as import('express').Response;
    expect(
      await skipApiRateLimit(
        req({ method: 'OPTIONS', originalUrl: '/api/v1/test' }),
        res,
      ),
    ).toBe(true);
    expect(
      await skipApiRateLimit(
        req({ method: 'GET', originalUrl: '/api/v1/auth/sign-in' }),
        res,
      ),
    ).toBe(true);
    expect(
      await skipApiRateLimit(
        req({ method: 'GET', originalUrl: '/api/v1/test' }),
        res,
      ),
    ).toBe(false);
  });

  it('rateLimitHandler forwards a RateLimitError with policy', () => {
    const next = vi.fn();
    rateLimitHandler(req(), {} as unknown as import('express').Response, next, {
      identifier: 'auth',
    } as unknown as Parameters<typeof rateLimitHandler>[3]);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0]?.[0] as unknown as RateLimitError;
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.statusCode).toBe(429);
    expect(err.policy).toBe('auth');
  });

  it('rateLimitHandler handles missing identifier', () => {
    const next = vi.fn();
    rateLimitHandler(
      req(),
      {} as unknown as import('express').Response,
      next,
      {} as unknown as Parameters<typeof rateLimitHandler>[3],
    );

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0]?.[0] as unknown as RateLimitError;
    expect(err.policy).toBeUndefined();
  });

  it('rateLimitLogger proxies to logger', () => {
    // Should not throw
    expect(() => rateLimitLogger.error(new Error('e'), 'msg')).not.toThrow();
    expect(() => rateLimitLogger.warn(new Error('e'), 'msg')).not.toThrow();
    expect(() => rateLimitLogger.error(new Error('e'))).not.toThrow();
  });
});
