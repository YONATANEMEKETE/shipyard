import { describe, expect, it } from 'vitest';
import {
  MCP_ERA,
  MCP_LEGACY_METHODS,
  MCP_LEGACY_PROTOCOL_VERSION,
  MCP_META_KEYS,
  MCP_METHODS,
  MCP_PARAMS_META_KEY,
  MCP_PROTOCOL_VERSION,
  MCP_SUPPORTED_VERSIONS,
  eraOfVersion,
  mcpLegacyCallToolResultSchema,
  mcpLegacyInitializeParamsSchema,
  mcpLegacyInitializeResultSchema,
  mcpLegacyListToolsResultSchema,
} from '@shipyard/shared';

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
  MCP_HANDSHAKE_METHOD,
  decodeMirrorValue,
  detectRequestEra,
  isTrustedOrigin,
  mirrorMatches,
  type McpEraSignal,
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
  it('advertises the whole registry in a fixed order — reads first, then the writes (M5, M7)', () => {
    expect(advertisedTools().map((tool) => tool.name)).toEqual([
      'shipyard_list_issues',
      'shipyard_get_issue',
      'shipyard_search',
      'shipyard_list_projects',
      'shipyard_list_cycles',
      'shipyard_workspace_overview',
      'shipyard_recent_activity',
      'shipyard_list_members',
      'shipyard_create_issue',
      'shipyard_update_issue',
      'shipyard_set_issue_status',
      'shipyard_assign_issue',
      'shipyard_block_issue',
      'shipyard_add_comment',
      'shipyard_archive_issue',
      'shipyard_restore_issue',
      'shipyard_delete_issue',
    ]);
  });

  it('prunes the list by scope, asserted by name', () => {
    // A credential that carries no scope discovers nothing at all.
    expect(advertisedTools([])).toEqual([]);

    // The scopes are separate doors, and pruning is by name because a refactor
    // must not be able to leak a write tool into a read-only list: an issues
    // writer sees the five issue writers and cannot see the comment tool.
    expect(advertisedTools(['ISSUES_WRITE']).map((tool) => tool.name)).toEqual([
      'shipyard_create_issue',
      'shipyard_update_issue',
      'shipyard_set_issue_status',
      'shipyard_assign_issue',
      'shipyard_block_issue',
    ]);
    expect(
      advertisedTools(['COMMENTS_WRITE']).map((tool) => tool.name),
    ).toEqual(['shipyard_add_comment']);
    // The gated lifecycle tools need their own scope, which is what makes them
    // reachable only by a connection that was deliberately given it (M8).
    expect(advertisedTools(['ISSUES_DELETE']).map((tool) => tool.name)).toEqual(
      [
        'shipyard_archive_issue',
        'shipyard_restore_issue',
        'shipyard_delete_issue',
      ],
    );

    expect(findTool('shipyard_list_issues')).toBeDefined();
    expect(findTool('shipyard_delete_issue')).toBeDefined();
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

describe('protocol eras', () => {
  it('lists both revisions it speaks, most-preferred first', () => {
    expect([...MCP_SUPPORTED_VERSIONS]).toEqual([
      MCP_PROTOCOL_VERSION,
      MCP_LEGACY_PROTOCOL_VERSION,
    ]);
    expect(MCP_PROTOCOL_VERSION).toBe('2026-07-28');
    // The newest revision the shipped SDK negotiates — which is why this era is
    // the one that lets a real client connect.
    expect(MCP_LEGACY_PROTOCOL_VERSION).toBe('2025-11-25');
  });

  it('maps each spoken revision to its era, and refuses to guess at the rest', () => {
    expect(eraOfVersion(MCP_PROTOCOL_VERSION)).toBe(MCP_ERA.modern);
    expect(eraOfVersion(MCP_LEGACY_PROTOCOL_VERSION)).toBe(MCP_ERA.legacy);

    // `null` is what makes a caller answer with the revisions it does speak
    // instead of picking the nearest one and serving a client it cannot serve.
    expect(eraOfVersion('2025-06-18')).toBeNull();
    expect(eraOfVersion('')).toBeNull();
  });

  it('recognizes the legacy handshake, and dispatches on the contract’s name', () => {
    expect(MCP_LEGACY_METHODS.initialize).toBe('initialize');
    expect(MCP_LEGACY_METHODS.initialized).toBe('notifications/initialized');
    expect(MCP_HANDSHAKE_METHOD).toBe(MCP_LEGACY_METHODS.initialize);
  });

  it('accepts a legacy initialize with or without the fields its era added later', () => {
    const full = mcpLegacyInitializeParamsSchema.parse({
      protocolVersion: MCP_LEGACY_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'inspector-cli', version: '2.7.0' },
    });
    expect(full.clientInfo?.name).toBe('inspector-cli');

    // The bare form: `protocolVersion` is the only field that era always sent.
    expect(
      mcpLegacyInitializeParamsSchema.parse({ protocolVersion: '2025-06-18' }),
    ).toEqual({ protocolVersion: '2025-06-18' });

    expect(() => mcpLegacyInitializeParamsSchema.parse({})).toThrow();
  });

  it('answers the handshake with serverInfo top-level and no session identity', () => {
    const result = mcpLegacyInitializeResultSchema.parse({
      protocolVersion: MCP_LEGACY_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'shipyard', version: '0.1.0' },
      instructions: 'Shipyard is a project-management workspace.',
    });

    // That era carried identity in the handshake, not in per-request `_meta`.
    expect(result.serverInfo.name).toBe('shipyard');
    // Statelessness is the ADR-005 property: nothing in the answer identifies a
    // session, because there is no session.
    expect(result).not.toHaveProperty('sessionId');
    expect(result).not.toHaveProperty('Mcp-Session-Id');
  });

  it('projects a modern result into the legacy envelope by dropping the modern frame', () => {
    const modern = {
      resultType: 'complete' as const,
      tools: [
        {
          name: 'shipyard_list_issues',
          description: 'Browse the issues in this workspace.',
          inputSchema: { type: 'object' as const },
        },
      ],
      ttlMs: 600_000,
      cacheScope: 'private' as const,
    };

    const legacy = mcpLegacyListToolsResultSchema.parse(modern);

    expect(legacy.tools.map((tool) => tool.name)).toEqual([
      'shipyard_list_issues',
    ]);
    // The frame is era-specific; the content is not. That is what makes the
    // projection safe to apply once, at the transport, instead of in handlers.
    expect(legacy).not.toHaveProperty('resultType');
    expect(legacy).not.toHaveProperty('ttlMs');
    expect(legacy).not.toHaveProperty('cacheScope');
  });

  it('keeps the diagnostics that ride in _meta across the era change', () => {
    const modern = {
      resultType: 'complete' as const,
      content: [{ type: 'text' as const, text: 'No issue matches SHIP-9999.' }],
      isError: true,
      _meta: {
        [MCP_META_KEYS.errorCode]: 'ISSUE_NOT_FOUND',
        [MCP_META_KEYS.requestId]: 'req-1',
      },
    };

    const legacy = mcpLegacyCallToolResultSchema.parse(modern);

    expect(legacy.isError).toBe(true);
    expect(legacy.content[0]?.text).toBe('No issue matches SHIP-9999.');
    expect(legacy._meta?.[MCP_META_KEYS.errorCode]).toBe('ISSUE_NOT_FOUND');
    expect(legacy).not.toHaveProperty('resultType');
  });
});

describe('era detection', () => {
  /** The modern per-request metadata, which is the whole modern signal. */
  const meta = (version: string) => ({
    [MCP_PARAMS_META_KEY]: { [MCP_META_KEYS.protocolVersion]: version },
  });

  const detect = (overrides: Partial<McpEraSignal> = {}) =>
    detectRequestEra({
      method: MCP_METHODS.listTools,
      params: undefined,
      versionHeader: undefined,
      ...overrides,
    });

  it('treats the handshake as legacy whatever revision it proposes', () => {
    // The method is the era signal: `initialize` does not exist in 2026-07-28, so
    // a client sending it is a legacy-era client even when it names a modern
    // revision — that revision is settled by negotiation, not by classification.
    expect(
      detect({
        method: MCP_LEGACY_METHODS.initialize,
        params: { protocolVersion: MCP_PROTOCOL_VERSION },
      }),
    ).toEqual({
      kind: 'detected',
      era: MCP_ERA.legacy,
      source: 'handshake',
      claimedVersion: MCP_PROTOCOL_VERSION,
    });

    expect(detect({ method: MCP_LEGACY_METHODS.initialized })).toEqual({
      kind: 'detected',
      era: MCP_ERA.legacy,
      source: 'handshake',
    });
  });

  it('reads modern metadata as modern, mirror disagreement or not', () => {
    expect(detect({ params: meta(MCP_PROTOCOL_VERSION) })).toEqual({
      kind: 'detected',
      era: MCP_ERA.modern,
      source: 'meta',
      claimedVersion: MCP_PROTOCOL_VERSION,
    });

    // A header that contradicts `_meta` is the mirrored-header rule's business
    // (-32020), which runs after classification — so the era is still modern here
    // and the request cannot talk its way out of the mirror.
    expect(
      detect({
        params: meta(MCP_PROTOCOL_VERSION),
        versionHeader: MCP_LEGACY_PROTOCOL_VERSION,
      }),
    ).toEqual({
      kind: 'detected',
      era: MCP_ERA.modern,
      source: 'meta',
      claimedVersion: MCP_PROTOCOL_VERSION,
    });
  });

  it('refuses metadata that claims the legacy era', () => {
    // `_meta` is the modern era's field. A legacy revision inside it is a request
    // claiming two eras at once — and serving it as legacy is exactly how a
    // caller would opt out of the mirrored headers.
    expect(detect({ params: meta(MCP_LEGACY_PROTOCOL_VERSION) })).toEqual({
      kind: 'undetermined',
      reason: 'era_conflict',
      claimedVersion: MCP_LEGACY_PROTOCOL_VERSION,
    });
  });

  it('reads the version header as the era when metadata is absent', () => {
    expect(detect({ versionHeader: MCP_LEGACY_PROTOCOL_VERSION })).toEqual({
      kind: 'detected',
      era: MCP_ERA.legacy,
      source: 'version_header',
      claimedVersion: MCP_LEGACY_PROTOCOL_VERSION,
    });

    // A modern revision in the header alone is still classified — the pipeline's
    // existing `_meta` requirement is what answers a request missing its envelope.
    expect(detect({ versionHeader: MCP_PROTOCOL_VERSION })).toEqual({
      kind: 'detected',
      era: MCP_ERA.modern,
      source: 'version_header',
      claimedVersion: MCP_PROTOCOL_VERSION,
    });
  });

  it('decodes a base64-wrapped header before reading it', () => {
    const wrapped = `=?base64?${Buffer.from(MCP_LEGACY_PROTOCOL_VERSION, 'utf8').toString('base64')}?=`;

    expect(detect({ versionHeader: wrapped })).toEqual({
      kind: 'detected',
      era: MCP_ERA.legacy,
      source: 'version_header',
      claimedVersion: MCP_LEGACY_PROTOCOL_VERSION,
    });
  });

  it('refuses to guess when nothing says which revision was used', () => {
    expect(detect()).toEqual({
      kind: 'undetermined',
      reason: 'no_version_signal',
    });
    expect(detect({ params: {} })).toEqual({
      kind: 'undetermined',
      reason: 'no_version_signal',
    });
    // Method names are case-sensitive: `Initialize` is not the handshake.
    expect(detect({ method: 'Initialize' })).toEqual({
      kind: 'undetermined',
      reason: 'no_version_signal',
    });
  });

  it('reports an unspoken revision instead of picking the nearest era', () => {
    expect(detect({ versionHeader: '2025-06-18' })).toEqual({
      kind: 'undetermined',
      reason: 'unsupported_version',
      claimedVersion: '2025-06-18',
    });
    expect(detect({ params: meta('2027-01-01') })).toEqual({
      kind: 'undetermined',
      reason: 'unsupported_version',
      claimedVersion: '2027-01-01',
    });
  });
});
