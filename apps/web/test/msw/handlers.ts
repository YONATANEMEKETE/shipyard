import { http, HttpResponse } from 'msw';

/**
 * Default request handlers. Add feature-specific handlers here as the app
 * gains API endpoints. Tests can override per-test via server.use(...).
 */
export const handlers = [
  http.get('*/api/v1/workspaces/:slug/projects', () => {
    return HttpResponse.json({ data: { projects: [] } });
  }),
  http.all('http://localhost:4000/*', () => {
    return HttpResponse.json(
      { error: { code: 'NOT_IMPLEMENTED', message: 'No handler registered' } },
      { status: 501 },
    );
  }),
];
