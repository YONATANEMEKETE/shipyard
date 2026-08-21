// Test-wide environment defaults. Applied before each test file's imports
// resolve, so env.ts validation sees a complete config. Existing values (e.g.
// DATABASE_URL from the global setup's container) are never overridden.
function setDefault(key: string, value: string): void {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

setDefault('NODE_ENV', 'test');
setDefault('API_PORT', '4000');
setDefault('API_URL', 'http://localhost:4000');
setDefault('WEB_URL', 'http://localhost:3000');
setDefault('LOG_LEVEL', 'silent');
setDefault('BETTER_AUTH_SECRET', 'test-secret-at-least-thirty-two-chars-long');
// Keep rate limiters permissive so integration tests aren't throttled.
setDefault('API_RATE_LIMIT_MAX', '100000');
setDefault('AUTH_RATE_LIMIT_MAX', '100000');
