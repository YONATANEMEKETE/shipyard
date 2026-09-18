import { describe, expect, it } from 'vitest';
import { MCP_META_KEYS } from '@shipyard/shared';

import { AppError } from '../../../src/common/errors/AppError.js';
import { env } from '../../../src/common/config/env.js';
import { toToolResultFromError } from '../../../src/features/mcp/errors.js';
import { missingScopeResult } from '../../../src/features/mcp/errors.js';
import {
  checkTokenRateLimit,
  rateLimitToolResult,
} from '../../../src/features/mcp/rateLimit.js';
import {
  advertisedTools,
  findTool,
} from '../../../src/features/mcp/registry.js';
import {
  decodeMirrorValue,
  isTrustedOrigin,
  mirrorMatches,
} from '../../../src/features/mcp/transport.js';

/**
 * Pure transport + mapper units (api-design §11, "Unit" row): the error mapper
 * and the header-mirroring rules. No app, no database — these are the decisions
 * that are cheapest to get wrong and most expensive to debug through HTTP.
 */

describe('toToolResultFromError', () => {
  it('turns an AppError into a readable tool result with its code in _meta', () => {
    const error = new AppError(
      403,
      'FORBIDDEN_ROLE',
      'Deleting an issue needs an Owner or Admin; your role is MEMBER. Ask an admin, or archive it instead.',
    );

    const result = toToolResultFromError(error, 'req-123');

    expect(result.isError).toBe(true);
    expect(result.resultType).toBe('complete');
    // The sentence is the message the service wrote for a reader — the model
    // corrects itself from this text, not from the code.
    expect(result.content[0]?.text).toBe(error.message);
    expect(result._meta?.[MCP_META_KEYS.errorCode]).toBe('FORBIDDEN_ROLE');
    expect(result._meta?.[MCP_META_KEYS.requestId]).toBe('req-123');
  });

  it('keeps an internal failure generic and leaks nothing', () => {
    // What a Prisma or driver failure looks like: a message full of table and
    // column names that must never reach a model or a log consumer.
    const leaky = new Error(
      'Invalid `prisma.mcpToken.findUnique()` invocation: relation "mcp_token" does not exist',
    );

    const result = toToolResultFromError(leaky, 'req-456');
    const text = result.content[0]?.text ?? '';

    expect(result.isError).toBe(true);
    expect(text).not.toContain('prisma');
    expect(text).not.toContain('mcp_token');
    expect(text).not.toContain(leaky.message);
    expect(text).not.toMatch(/stack|at Object\./u);
    expect(result._meta?.[MCP_META_KEYS.errorCode]).toBe(
      'INTERNAL_SERVER_ERROR',
    );
    expect(result._meta?.[MCP_META_KEYS.requestId]).toBe('req-456');
  });

  it('handles a thrown non-Error without inventing detail', () => {
    const result = toToolResultFromError('boom');

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).not.toContain('boom');
    expect(result.content.some((block) => block.text.trim().length > 0)).toBe(
      true,
    );
  });
});

describe('mirrored headers', () => {
  it('passes an unwrapped value through untouched', () => {
    expect(decodeMirrorValue('2026-07-28')).toBe('2026-07-28');
  });

  it('decodes a value wrapped in the base64 sentinel', () => {
    const wrapped = `=?base64?${Buffer.from('tools/list', 'utf8').toString('base64')}?=`;

    expect(decodeMirrorValue(wrapped)).toBe('tools/list');
  });

  it('leaves a malformed sentinel alone rather than guessing', () => {
    expect(decodeMirrorValue('=?base64?not-wrapped')).toBe(
      '=?base64?not-wrapped',
    );
  });

  it('never matches a missing header', () => {
    // The caller decides whether that is "missing" (-32020) or "not applicable
    // for this method" — the helper must not answer it.
    expect(mirrorMatches(undefined, 'tools/list')).toBe(false);
  });

  it('matches exactly, and after decoding', () => {
    expect(mirrorMatches('tools/list', 'tools/list')).toBe(true);
    expect(mirrorMatches('  tools/list  ', 'tools/list')).toBe(true);
    expect(mirrorMatches('tools/call', 'tools/list')).toBe(false);

    const wrapped = `=?base64?${Buffer.from('server/discover', 'utf8').toString('base64')}?=`;
    expect(mirrorMatches(wrapped, 'server/discover')).toBe(true);
  });
});

describe('origin trust', () => {
  it('accepts a non-browser client (no Origin header)', () => {
    // The DNS-rebinding guard exists to stop a *page*, and a page can never
    // suppress the header — rejecting the absent case would break every CLI.
    expect(isTrustedOrigin(undefined)).toBe(true);
    expect(isTrustedOrigin('')).toBe(true);
  });

  it('accepts the web app origin and loopback outside production', () => {
    expect(isTrustedOrigin(new URL(env.WEB_URL).origin)).toBe(true);
    expect(isTrustedOrigin('http://localhost:6274')).toBe(true);
    expect(isTrustedOrigin('http://127.0.0.1:5173')).toBe(true);
  });

  it('rejects any other origin, including the opaque one', () => {
    expect(isTrustedOrigin('https://evil.example.com')).toBe(false);
    expect(isTrustedOrigin('http://localhost.evil.example.com')).toBe(false);
    expect(isTrustedOrigin('null')).toBe(false);
  });
});

describe('the registry', () => {
  it('advertises the eight read tools, in a fixed order (M5)', () => {
    expect(advertisedTools().map((tool) => tool.name)).toEqual([
      'shipyard_list_issues',
      'shipyard_get_issue',
      'shipyard_search',
      'shipyard_list_projects',
      'shipyard_list_cycles',
      'shipyard_workspace_overview',
      'shipyard_recent_activity',
      'shipyard_list_members',
    ]);

    // Every tool shipped so far is a read tool, so a credential that carries no
    // READ scope discovers nothing at all — the pruning is asserted by name
    // because a refactor must not be able to leak a write tool into a list.
    expect(advertisedTools([])).toEqual([]);
    expect(advertisedTools(['ISSUES_WRITE'])).toEqual([]);

    expect(findTool('shipyard_list_issues')).toBeDefined();
    expect(findTool('shipyard_delete_issue')).toBeUndefined();
  });
});

describe('per-token budget', () => {
  const config = { windowMs: 60_000, max: 3 };
  const t0 = 1_700_000_000_000;

  it('allows up to the max inside a window, then refuses', () => {
    expect(checkTokenRateLimit('t1', t0, config)).toEqual({
      allowed: true,
      retryAfterMs: 0,
      remaining: 2,
    });
    expect(checkTokenRateLimit('t1', t0 + 1, config)).toEqual({
      allowed: true,
      retryAfterMs: 59_999,
      remaining: 1,
    });
    expect(checkTokenRateLimit('t1', t0 + 2, config).allowed).toBe(true);

    const refused = checkTokenRateLimit('t1', t0 + 3, config);

    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
    // The hint is time until the window resets, not a fixed backoff.
    expect(refused.retryAfterMs).toBe(60_000 - 3);
  });

  it('starts a fresh window when the old one expires', () => {
    checkTokenRateLimit('t2', t0, { windowMs: 1_000, max: 1 });
    expect(
      checkTokenRateLimit('t2', t0 + 500, { windowMs: 1_000, max: 1 }).allowed,
    ).toBe(false);

    const afterWindow = checkTokenRateLimit('t2', t0 + 1_001, {
      windowMs: 1_000,
      max: 1,
    });

    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(0);
  });

  it('keeps one budget per token', () => {
    checkTokenRateLimit('t3', t0, { windowMs: 60_000, max: 1 });
    expect(
      checkTokenRateLimit('t3', t0 + 1, { windowMs: 60_000, max: 1 }).allowed,
    ).toBe(false);

    expect(
      checkTokenRateLimit('t4', t0 + 1, { windowMs: 60_000, max: 1 }).allowed,
    ).toBe(true);
  });

  it('carries a pacing hint in the tool result', () => {
    const result = rateLimitToolResult({
      allowed: false,
      retryAfterMs: 30_000,
      remaining: 0,
    });

    // A tool result, not a status: the model has to read it to pace itself
    // (§8.2 / §10).
    expect(result.isError).toBe(true);
    expect(result._meta?.[MCP_META_KEYS.errorCode]).toBe('RATE_LIMITED');
    expect(result._meta?.retryAfterMs).toBe(30_000);
    expect(result.content[0]?.text).toContain('30s');
  });
});

describe('missingScopeResult', () => {
  it('names the permission and both ways out', () => {
    const result = missingScopeResult('ISSUES_WRITE');
    const text = result.content[0]?.text ?? '';

    expect(result.isError).toBe(true);
    expect(text).toContain('ISSUES_WRITE');
    expect(text).toContain('Create another connection');
    expect(result._meta?.[MCP_META_KEYS.errorCode]).toBe('SCOPE_MISSING');
    expect(result._meta?.requiredScope).toBe('ISSUES_WRITE');
  });
});
