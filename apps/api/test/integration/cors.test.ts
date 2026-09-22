import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { env } from '../../src/common/config/env.js';

const WEB_ORIGIN = env.WEB_URL;
const FOREIGN_ORIGIN = 'https://not-trusted.example.com';

describe('CORS on the public API surface', () => {
  it('answers a preflight from the web origin with credentials and the MCP headers allowed', async () => {
    const request = createTestApp();
    const response = await request
      .options('/api/v1/workspaces')
      .set('Origin', WEB_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .set(
        'Access-Control-Request-Headers',
        'content-type,authorization,mcp-protocol-version,mcp-method,mcp-name',
      );

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    const allowed = String(
      response.headers['access-control-allow-headers'],
    ).toLowerCase();
    expect(allowed).toContain('authorization');
    expect(allowed).toContain('mcp-protocol-version');
    expect(allowed).toContain('mcp-method');
    expect(allowed).toContain('mcp-name');
    expect(String(response.headers.vary)).toContain('Origin');
  });

  it('sends no CORS headers to an untrusted origin', async () => {
    const request = createTestApp();
    const response = await request
      .options('/api/v1/workspaces')
      .set('Origin', FOREIGN_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('leaves non-browser requests untouched', async () => {
    const request = createTestApp();
    const response = await request.get('/healthz');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps the CORS headers on error responses', async () => {
    const request = createTestApp();
    const response = await request
      .get('/api/v1/does-not-exist')
      .set('Origin', WEB_ORIGIN);

    expect(response.status).toBe(404);
    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
  });
});
