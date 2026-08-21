import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { setReady } from '../../src/common/health/readiness.js';

describe('GET /healthz', () => {
  it('returns 200 with ok status', async () => {
    const request = createTestApp();
    const response = await request.get('/healthz');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { service: 'api', status: 'ok' },
    });
  });
});

describe('GET /readyz', () => {
  beforeEach(() => setReady(true));
  afterEach(() => setReady(true));

  it('returns 200 when ready', async () => {
    const request = createTestApp();
    const response = await request.get('/readyz');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { service: 'api', status: 'ready' },
    });
  });

  it('returns 503 when not ready', async () => {
    const request = createTestApp();
    setReady(false);
    const response = await request.get('/readyz');

    expect(response.status).toBe(503);
    expect((response.body as { error?: unknown }).error).toBeDefined();
  });
});

describe('unknown routes', () => {
  it('returns 404', async () => {
    const request = createTestApp();
    const response = await request.get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect((response.body as { error?: unknown }).error).toBeDefined();
  });
});
