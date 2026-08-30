import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
    setupFiles: ['test/setup.ts'],
    css: true,
    env: { NODE_ENV: 'test' },
    // jsdom + RTL under parallel CI load: the settings prefill test was the
    // first to blow past the 5s default under heavy CPU contention. Roomier
    // per-test budget keeps real failures (which fail fast) distinguishable
    // from slow-environment false positives.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
    },
    api: {
      port: 51205,
    },
  },
});
