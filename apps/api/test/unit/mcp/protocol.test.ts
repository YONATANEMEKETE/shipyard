import { describe, expect, it } from 'vitest';
import { MCP_META_KEYS } from '@shipyard/shared';

import { AppError } from '../../../src/common/errors/AppError.js';
import { env } from '../../../src/common/config/env.js';
import { toToolResultFromError } from '../../../src/features/mcp/errors.js';
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
  it('advertises nothing while no tool has shipped (M3)', () => {
    expect(advertisedTools()).toEqual([]);
    expect(findTool('shipyard_list_issues')).toBeUndefined();
  });
});
