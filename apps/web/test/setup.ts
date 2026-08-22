import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { server } from './msw/server.js';

// --- next/font/google mock ------------------------------------------------
// Next.js font loaders are build-time features; stub them with the shape the
// layout expects ({ variable, style }).
vi.mock('next/font/google', () => ({
  Inter: () => ({
    variable: '--font-sans',
    style: { fontFamily: 'var(--font-sans)' },
  }),
  Geist: () => ({
    variable: '--font-display',
    style: { fontFamily: 'var(--font-display)' },
  }),
  Geist_Mono: () => ({
    variable: '--font-mono',
    style: { fontFamily: 'var(--font-mono)' },
  }),
}));

// --- MSW -------------------------------------------------------------------
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());
