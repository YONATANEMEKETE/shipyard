import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { server } from './msw/server.js';

// --- Async assertion budget -------------------------------------------------
// `waitFor` does not use vitest's `testTimeout`; it has its own budget, which
// defaults to 1000ms. Under the parallel CI load this suite runs in (jsdom +
// React Query + MSW per worker), a state that arrives after a mocked request can
// exceed one second and fail a test whose subject is perfectly correct — the
// settings appearance test was the first to expose it, and one call elsewhere
// was hand-bumped to 2000ms as a patch. Raise the budget once, here, instead:
// it is the same reasoning that set `testTimeout` in vitest.config.js, applied to
// the timeout that actually governs these assertions. A real regression still
// fails — it just fails after 5s rather than 1s, well inside the 15s test budget.
configure({ asyncUtilTimeout: 5_000 });

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

// --- Radix / browser APIs ---------------------------------------------------
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
