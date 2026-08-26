/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unnecessary-type-assertion */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  ValidationError,
  RateLimitError,
} from '../../../src/common/errors/httpErrors.js';
import { errorHandler } from '../../../src/common/middlewares/errorHandler.js';
import { ErrorCodes } from '../../../src/common/errors/codes.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/test',
    id: 'req-1',
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(overrides: Partial<Response> = {}): Response & {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const res = {
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    ...overrides,
  } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  return res;
}

describe('errorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to next when headersSent is true', () => {
    const err = new Error('boom');
    const req = mockReq();
    const res = mockRes({ headersSent: true });
    const next = vi.fn();

    errorHandler(err, req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('handles AppError with envelope and requestId', () => {
    const err = new ValidationError('bad input', { field: 'email' });
    const req = mockReq({ originalUrl: '/api/v1/auth/sign-up', id: 'rid-123' });
    const res = mockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as {
      error: {
        code: string;
        message: string;
        details: unknown;
        requestId: string;
      };
    };
    expect(body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(body.error.message).toBe('bad input');
    expect(body.error.details).toEqual({ field: 'email' });
    expect(body.error.requestId).toBe('rid-123');
    expect(next).not.toHaveBeenCalled();
  });

  it('includes rateLimit policy when handling RateLimitError', () => {
    const err = new RateLimitError(undefined, undefined, undefined, 'auth');
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(429);
    const body = (res.json as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as {
      error: { code: string };
    };
    expect(body.error.code).toBe(ErrorCodes.RATE_LIMITED);
  });

  it('handles ZodError as 400 VALIDATION_ERROR', () => {
    let zodError: unknown;
    try {
      z.object({ email: z.string().email() }).parse({ email: 'not-an-email' });
    } catch (e) {
      zodError = e;
    }
    const reqNoId = {
      method: 'GET',
      originalUrl: '/test',
      headers: {},
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    errorHandler(zodError, reqNoId, res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as {
      error: { code: string; message: string; details: unknown[] };
    };
    expect(body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
    );
  });

  it('handles malformed JSON (entity.parse.failed) as 400 BAD_REQUEST', () => {
    const err = Object.assign(new Error('parse failed'), {
      type: 'entity.parse.failed',
    });
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe(ErrorCodes.BAD_REQUEST);
    expect(body.error.message).toBe('Malformed JSON in request body');
  });

  it('falls back to 500 INTERNAL_SERVER_ERROR for unknown errors', () => {
    const err = new Error('unexpected');
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe(ErrorCodes.INTERNAL_SERVER_ERROR);
    expect(body.error.message).toBe('An unexpected error occurred');
  });

  it('omits requestId when not present on request', () => {
    const err = new ValidationError('oops');
    const reqNoId = {
      method: 'POST',
      originalUrl: '/x',
      headers: {},
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    errorHandler(err, reqNoId, res, next as unknown as NextFunction);

    const body = (res.json as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as {
      error: { requestId?: string };
    };
    expect(body.error.requestId).toBeUndefined();
  });
});
