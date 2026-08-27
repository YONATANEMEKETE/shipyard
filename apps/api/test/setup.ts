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
// Required by env validation so importing the mailer/auth chain stays
// hermetic; NODE_ENV=test makes sendEmail log instead of hitting Resend.
setDefault('RESEND_API_KEY', 'test-resend-key');
setDefault('RESEND_FROM', 'Shipyard <no-reply@test.local>');
// Required by env validation for the social provider wiring; tests never
// perform real OAuth round-trips, only exercise the mounted handlers.
setDefault('GOOGLE_CLIENT_ID', 'test-google-client-id');
setDefault('GOOGLE_CLIENT_SECRET', 'test-google-client-secret');
setDefault('GITHUB_CLIENT_ID', 'test-github-client-id');
setDefault('GITHUB_CLIENT_SECRET', 'test-github-client-secret');
// Keep rate limiters permissive so integration tests aren't throttled.
setDefault('API_RATE_LIMIT_MAX', '100000');
setDefault('AUTH_RATE_LIMIT_MAX', '100000');
