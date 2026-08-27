import { describe, it, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { validate } from '../../../src/common/middlewares/validate.js';

type LooseNext = (...args: unknown[]) => void;

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    body: {},
    query: {},
    params: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function makeResponse(): Response {
  return {} as unknown as Response;
}

/** Creates a vitest mock usable as an Express `next` and exposes its calls. */
function makeNext() {
  const spy = vi.fn<LooseNext>();
  // Express 5's NextFunction has extra overloads a bare mock can't match, so
  // we widen through `unknown` once here.
  const next = spy as unknown as NextFunction;
  return { next, calls: spy.mock.calls };
}

describe('validate middleware', () => {
  const bodySchema = z.object({
    name: z.string().trim().min(1),
    icon: z.string().optional(),
  });
  const paramSchema = z.object({ slug: z.string().min(1) });
  const querySchema = z.object({ limit: z.coerce.number().int().positive() });

  it('normalizes a valid body (trim applied) and calls next', () => {
    const { next, calls } = makeNext();
    const request = makeRequest({ body: { name: '  Shipyard  ' } });

    validate.all({ body: bodySchema })(request, makeResponse(), next);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([]);
    // raw input replaced with parsed (trimmed) output
    expect(request.body).toEqual({ name: 'Shipyard' });
  });

  it('forwards a ZodError for an invalid body (no normalization)', () => {
    const { next, calls } = makeNext();
    const request = makeRequest({ body: { name: '' } });

    validate.all({ body: bodySchema })(request, makeResponse(), next);

    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBeInstanceOf(ZodError);
    expect(request.body).toEqual({ name: '' });
  });

  it('validates and normalizes params', () => {
    const { next, calls } = makeNext();
    const request = makeRequest({ params: { slug: 'my-workspace' } });

    validate.all({ params: paramSchema })(request, makeResponse(), next);

    expect(calls[0]).toEqual([]);
    expect(request.params).toEqual({ slug: 'my-workspace' });
  });

  it('validates query params with coercion', () => {
    const { next, calls } = makeNext();
    const request = makeRequest({ query: { limit: '10' } });

    validate.all({ query: querySchema })(request, makeResponse(), next);

    expect(calls[0]).toEqual([]);
    // string "10" coerced to number 10
    expect(request.query).toEqual({ limit: 10 });
  });

  it('rejects an invalid query with a ZodError', () => {
    const { next, calls } = makeNext();
    const request = makeRequest({ query: { limit: '-5' } });

    validate.all({ query: querySchema })(request, makeResponse(), next);

    expect(calls[0]![0]).toBeInstanceOf(ZodError);
  });

  it('validates multiple sources in one call, stopping on the first failure', () => {
    const { next, calls } = makeNext();
    const request = makeRequest({ body: { name: 'A' }, params: { slug: '' } });

    validate.all({ body: bodySchema, params: paramSchema })(
      request,
      makeResponse(),
      next,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBeInstanceOf(ZodError);
  });

  it('passes through untouched when no sources are configured', () => {
    const { next, calls } = makeNext();
    const request = makeRequest();

    validate.all({})(request, makeResponse(), next);

    expect(calls[0]).toEqual([]);
    expect(request.body).toEqual({});
  });

  it('per-source helpers validate and normalize', () => {
    const { next, calls } = makeNext();
    const request = makeRequest({ body: { name: '  Rocket  ' } });

    validate.body(bodySchema)(request, makeResponse(), next);

    expect(calls[0]).toEqual([]);
    expect(request.body).toEqual({ name: 'Rocket' });
  });
});
