import cors from 'cors';
import { trustedOrigins } from '../config/trustedOrigins.js';

/**
 * Cross-origin policy for the public API surface.
 *
 * The web app calls the API directly from the browser, so those calls are
 * cross-origin (shipyard.yonatanem.com → api.yonatanem.com in production).
 * The allowlist is exact: `*` is impossible alongside `credentials: true`,
 * and reflecting an arbitrary Origin would let any site make credentialed
 * calls.
 *
 * Requests without an Origin header (curl, agents, server-to-server) are
 * unaffected — CORS is a browser read-guard, not the security boundary;
 * every route authenticates on its own.
 *
 * Mounted before the rate limiters (see `app.ts`) so preflights neither
 * consume rate-limit budget nor get a bare 429 that a browser would report
 * as a CORS failure.
 */
export const corsMiddleware = cors({
  origin(origin, callback) {
    // No Origin header: not a browser cross-origin request.
    if (origin === undefined || trustedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    // Denied: proceed without Access-Control headers, so the browser
    // refuses to expose the response. No error — nothing to log here.
    callback(null, false);
  },
  credentials: true,
  // Non-safelisted request headers the browser must be allowed to send:
  // JSON bodies, MCP bearer tokens, and the MCP transport's own headers
  // (ADR-005) — without these a browser-side MCP client fails preflight.
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'MCP-Protocol-Version',
    'Mcp-Method',
    'Mcp-Name',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // Browsers may cache the preflight result for 10 minutes.
  maxAge: 600,
});
