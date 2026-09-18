import { env } from '../../common/config/env.js';
import { MCP_META_KEYS, type McpCallToolResult } from '@shipyard/shared';
import { McpErrorCodes } from './errors.js';

// ─────────────────────────────────────────────────────────────────────────────
// Per-token rate limiting (F13, M4 — api-design §10)
//
// Counted **per token**, never per IP: agents share an IP with every other
// process on the machine, and a member may run several, so an IP limit punishes
// the wrong caller and cannot be fair between credentials. The credential is the
// identity on this surface, so it is the unit of accounting.
//
// Deliberately not `express-rate-limit`: the breach has to be answerable in two
// different shapes (see `rateLimitRefusal`), one of which is a *tool result* the
// caller's model reads — a middleware can only end the request. What is reused
// from the platform's limiter is the shape of the decision, not its plumbing.
//
// Per-process, fixed window, in memory — the same trade-off the API's own
// limiter makes with its default store. It protects a single instance from a
// single runaway credential; multi-instance fairness is a deployment concern
// (M9), and the answer there is a shared store, not a bigger map.
// ─────────────────────────────────────────────────────────────────────────────

export interface McpRateLimitConfig {
  windowMs: number;
  /** Requests allowed per window, per token. */
  max: number;
}

export interface McpRateLimitDecision {
  allowed: boolean;
  /** How long until the window resets — the caller's pacing hint. */
  retryAfterMs: number;
  /** How many requests are left in the current window. */
  remaining: number;
}

function configFromEnv(): McpRateLimitConfig {
  return {
    windowMs: env.MCP_RATE_LIMIT_WINDOW_MS,
    max: env.MCP_RATE_LIMIT_MAX,
  };
}

/** The configuration in force — exported so tests and logs can read it. */
export const mcpRateLimitConfig: McpRateLimitConfig = configFromEnv();

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

// Bounded memory: a budget of tokens is finite, but a process that runs for
// months should not accumulate an entry per revoked credential forever. Sweeping
// only when the map is large keeps the common path free of bookkeeping.
const SWEEP_THRESHOLD = 1000;

function sweep(now: number): void {
  if (windows.size <= SWEEP_THRESHOLD) {
    return;
  }

  for (const [key, window] of windows) {
    if (window.resetAt <= now) {
      windows.delete(key);
    }
  }
}

/**
 * Counts one request against a token's budget.
 *
 * A fixed window: the first request after a reset starts a new one, and the
 * window ends `windowMs` later. Simpler than a sliding log, and the difference
 * only shows up as a two-window burst at the boundary — acceptable for a
 * fairness limit whose breach is a hint, not a hard security control.
 *
 * `now` and `overrides` exist for tests: the pipeline always calls it with
 * neither, so the behaviour under test is the behaviour in production.
 */
export function checkTokenRateLimit(
  tokenId: string,
  now: number = Date.now(),
  overrides: Partial<McpRateLimitConfig> = {},
): McpRateLimitDecision {
  const { windowMs, max } = { ...mcpRateLimitConfig, ...overrides };

  sweep(now);

  const current = windows.get(tokenId);

  if (current === undefined || current.resetAt <= now) {
    windows.set(tokenId, { count: 1, resetAt: now + windowMs });

    return { allowed: true, retryAfterMs: 0, remaining: max - 1 };
  }

  current.count += 1;

  const retryAfterMs = current.resetAt - now;

  if (current.count > max) {
    return { allowed: false, retryAfterMs, remaining: 0 };
  }

  return {
    allowed: true,
    retryAfterMs,
    remaining: Math.max(0, max - current.count),
  };
}

/** Test seam: a fresh process should not inherit another test's budget. */
export function resetTokenRateLimits(): void {
  windows.clear();
}

/**
 * The breach, as the caller's model reads it (api-design §10, §8.2): a tool
 * result that says to slow down and when to retry, because a bare `429` inside a
 * tool call would surface to the model as an unexplained failure with no way to
 * pace itself.
 *
 * The heading method is `tools/call`; every other method has no result channel
 * and is answered with the transport-level `429` the platform's limiter uses.
 */
export function rateLimitToolResult(
  decision: McpRateLimitDecision,
): McpCallToolResult {
  const seconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));

  return {
    resultType: 'complete',
    content: [
      {
        type: 'text',
        text: `This token has used its request budget for now. Wait about ${seconds}s and try again, or use a different connection for this work.`,
      },
    ],
    isError: true,
    _meta: {
      [MCP_META_KEYS.errorCode]: McpErrorCodes.RATE_LIMITED,
      retryAfterMs: decision.retryAfterMs,
    },
  };
}
