import { beforeEach, describe, expect, it } from 'vitest';
import {
  MCP_ERROR_CODES,
  MCP_HEADERS,
  MCP_LEGACY_METHODS,
  MCP_LEGACY_PROTOCOL_VERSION,
  MCP_META_KEYS,
  MCP_METHODS,
  MCP_PROTOCOL_VERSION,
  MCP_SUPPORTED_VERSIONS,
  mcpLegacyInitializeResultSchema,
} from '@shipyard/shared';

import { createTestApp } from '../../../helpers/app.js';
import { resetDatabase } from '../../../helpers/db.js';
import { env } from '../../../../src/common/config/env.js';
import { prisma } from '../../../../src/common/db/client.js';
import type { WorkspaceRequestContext } from '../../../../src/common/guards/workspace-context.js';
import { issuesService } from '../../../../src/features/issues/service.js';
import { resetTokenRateLimits } from '../../../../src/features/mcp/rateLimit.js';
import { mcpTokensService } from '../../../../src/features/mcp/service.js';

/**
 * The legacy era on the modern endpoint (F13, M6) — api-design §5.6.
 *
 * Every request shape in this file was **measured** from the shipped client
 * (`@modelcontextprotocol/inspector@2.7.0`, SDK 1.30.0) against a probe server,
 * not inferred from the specification:
 *
 *   - `initialize` carries `params.protocolVersion` and **no** version header;
 *   - every request after it carries `MCP-Protocol-Version: 2025-11-25`;
 *   - nothing ever carries `Mcp-Name`, and `params._meta` never appears;
 *   - the client accepts a **session-less** handshake and a plain-JSON answer to
 *     an `Accept: application/json, text/event-stream` request;
 *   - it opens a GET stream and is content with `405`.
 *
 * The last third of this file is the regression that matters most: accepting an
 * older era must not have loosened anything on the modern path.
 */

type Request = ReturnType<typeof createTestApp>;

interface JsonRpcBody {
  jsonrpc?: string;
  id?: unknown;
  result?: unknown;
  error?: {
    code?: number | string;
    message?: string;
    data?: { supported?: string[]; requested?: string };
    requestId?: string;
  };
}

interface ToolResultEnvelope {
  content: { type: string; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
  resultType?: unknown;
}

const ENDPOINT = '/mcp';
const WEB_ORIGIN = new URL(env.WEB_URL).origin;
const VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';

let agentToken = '';
let agentTokenId = '';
let agentContext: WorkspaceRequestContext;
let agentUserId = '';

beforeEach(async () => {
  await resetDatabase();
  resetTokenRateLimits();

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: {
      id: `user_${suffix}`,
      name: 'Agent Owner',
      email: `agent-${suffix}@example.com`,
      emailVerified: true,
    },
  });
  const workspace = await prisma.workspace.create({
    data: { name: 'Harbor', slug: `harbor-${suffix}` },
  });
  const member = await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role: 'MEMBER' },
  });

  agentContext = {
    workspaceId: workspace.id,
    memberId: member.id,
    slug: workspace.slug,
    status: 'ACTIVE',
    role: 'MEMBER',
  };
  agentUserId = user.id;

  const created = await mcpTokensService.create(agentContext, user.id, {
    label: 'legacy client',
    scopes: ['READ'],
  });
  agentToken = created.token;
  agentTokenId = created.id;
});

function bodyOf(res: { body: unknown }): JsonRpcBody {
  return res.body as JsonRpcBody;
}

function toolResultOf(res: { body: unknown }): ToolResultEnvelope {
  return bodyOf(res).result as ToolResultEnvelope;
}

/**
 * The headers the measured client sends: the version header on everything after
 * the handshake, and — the point of the era — no `Mcp-Method`, no `Mcp-Name`,
 * and no `_meta` in the body.
 *
 * Omission is expressed through `overrides` rather than a positional argument, so
 * "this client does not send the header" cannot be lost to a default parameter.
 * `undefined` removes a header.
 */
function legacyHeaders(
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  const headers: Record<string, string | undefined> = {
    Origin: WEB_ORIGIN,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    [MCP_HEADERS.protocolVersion]: MCP_LEGACY_PROTOCOL_VERSION,
    Authorization: `Bearer ${agentToken}`,
    ...overrides,
  };

  return Object.fromEntries(
    Object.entries(headers).filter(([, value]) => value !== undefined),
  ) as Record<string, string>;
}

/** The handshake headers: the measured client sends no version header here. */
const HANDSHAKE_HEADERS: Record<string, string | undefined> = {
  [MCP_HEADERS.protocolVersion]: undefined,
};

/** A modern-era body: the revision and identity travel in `_meta`. */
function modernBody(
  method: string,
  params: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: 'modern-1',
    method,
    params: { _meta: { [VERSION_META_KEY]: MCP_PROTOCOL_VERSION }, ...params },
  };
}

/** A modern-era client's headers: both mirrors, and the modern revision. */
function modernHeaders(
  method: string,
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      Origin: WEB_ORIGIN,
      'Content-Type': 'application/json',
      [MCP_HEADERS.protocolVersion]: MCP_PROTOCOL_VERSION,
      [MCP_HEADERS.method]: method,
      Authorization: `Bearer ${agentToken}`,
      ...overrides,
    }).filter(([, value]) => value !== undefined),
  );
}

function post(
  request: Request,
  body: unknown,
  headers: Record<string, string>,
) {
  return request
    .post(ENDPOINT)
    .set(headers)
    .send(body as object);
}

/** The handshake request, verbatim from the probe log. */
function initializeBody(id: string | number = 'init-1') {
  return {
    jsonrpc: '2.0',
    id,
    method: MCP_LEGACY_METHODS.initialize,
    params: {
      protocolVersion: MCP_LEGACY_PROTOCOL_VERSION,
      capabilities: { roots: { listChanged: true } },
      clientInfo: { name: 'inspector-cli', version: '2.7.0' },
    },
  };
}

/** A post-handshake request: no `_meta`, no mirrors — just the version header. */
function legacyRequest(method: string, params: Record<string, unknown> = {}) {
  return { jsonrpc: '2.0', id: 'req-1', method, params };
}

describe('POST /mcp — the legacy handshake', () => {
  it('answers initialize statelessly, with our revision and identity top-level', async () => {
    const res = await post(
      createTestApp(),
      initializeBody(),
      // No version header: the measured client does not send one here.
      legacyHeaders(HANDSHAKE_HEADERS),
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');

    const result = mcpLegacyInitializeResultSchema.parse(bodyOf(res).result);

    // Ours, not the client's proposal: that era's negotiation rule is that a
    // server answers with a revision it speaks.
    expect(result.protocolVersion).toBe(MCP_LEGACY_PROTOCOL_VERSION);
    // Identity travels top-level in that era — there is no per-request `_meta`.
    expect(result.serverInfo.name).toBe('shipyard');
    expect(result.capabilities.tools?.listChanged).toBe(false);
    expect(result.instructions).toContain('SHIP-42');

    // Stateless (ADR-005): no session is created, so none is announced — neither
    // as a header nor in the body. The measured client accepts this and proceeds.
    expect(res.headers['mcp-session-id']).toBeUndefined();
    expect(result).not.toHaveProperty('sessionId');
  });

  it('requires a credential for the handshake like every other request', async () => {
    const res = await post(
      createTestApp(),
      initializeBody(),
      legacyHeaders({ ...HANDSHAKE_HEADERS, Authorization: undefined }),
    );

    // The same 401 the cookie path and the modern door produce: one credential
    // story, told once.
    expect(res.status).toBe(401);
    expect(bodyOf(res).error?.code).toBe('UNAUTHORIZED');
    expect(bodyOf(res).error?.requestId).toBeDefined();
  });

  it('acknowledges notifications/initialized with 202 and no body', async () => {
    const res = await post(
      createTestApp(),
      { jsonrpc: '2.0', method: MCP_LEGACY_METHODS.initialized },
      legacyHeaders(),
    );

    expect(res.status).toBe(202);
    expect(res.text).toBe('');
  });

  it('treats the method as the era signal, even when metadata claims modern', async () => {
    // A modern client *cannot* send `initialize` — the method does not exist in
    // its revision. When one does anyway, the honest answer is the handshake its
    // own era defines, not a version complaint about a revision we serve.
    const res = await post(
      createTestApp(),
      {
        ...initializeBody('modern-shaped'),
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          _meta: { [VERSION_META_KEY]: MCP_PROTOCOL_VERSION },
        },
      },
      legacyHeaders({
        ...HANDSHAKE_HEADERS,
        [MCP_HEADERS.method]: MCP_LEGACY_METHODS.initialize,
      }),
    );

    const result = bodyOf(res).result as { protocolVersion: string };

    expect(res.status).toBe(200);
    expect(result.protocolVersion).toBe(MCP_LEGACY_PROTOCOL_VERSION);
  });
});

describe('POST /mcp — the legacy era after the handshake', () => {
  it('answers tools/list in that era’s envelope', async () => {
    const res = await post(
      createTestApp(),
      legacyRequest(MCP_METHODS.listTools),
      legacyHeaders(),
    );

    expect(res.status).toBe(200);

    const result = bodyOf(res).result as {
      tools: { name: string }[];
      resultType?: unknown;
      ttlMs?: unknown;
      cacheScope?: unknown;
    };

    expect(result.tools.map((tool) => tool.name)).toEqual([
      'shipyard_list_issues',
      'shipyard_get_issue',
      'shipyard_search',
      'shipyard_list_projects',
      'shipyard_list_cycles',
      'shipyard_workspace_overview',
      'shipyard_recent_activity',
      'shipyard_list_members',
    ]);

    // The projection: same tools, none of the modern frame a client of that era
    // would have to tolerate without a contract for it.
    expect(result.resultType).toBeUndefined();
    expect(result.ttlMs).toBeUndefined();
    expect(result.cacheScope).toBeUndefined();
  });

  it('answers tools/call with real data and no modern frame', async () => {
    const issue = await issuesService.create(agentContext, agentUserId, {
      title: 'Login redirect loops',
    });

    const res = await post(
      createTestApp(),
      legacyRequest(MCP_METHODS.callTool, {
        name: 'shipyard_list_issues',
        arguments: { limit: 5 },
      }),
      legacyHeaders(),
    );

    expect(res.status).toBe(200);

    const result = toolResultOf(res);

    expect(result.content[0]?.text).toContain(issue.identifier);
    expect(result.content[0]?.text).toContain('Login redirect loops');
    expect(result.isError).toBeUndefined();
    expect(result.resultType).toBeUndefined();
  });

  it('keeps a domain failure actionable, and its diagnostics in _meta', async () => {
    const res = await post(
      createTestApp(),
      legacyRequest(MCP_METHODS.callTool, {
        name: 'shipyard_get_issue',
        arguments: { issue: 'SHIP-9999' },
      }),
      legacyHeaders(),
    );

    const result = toolResultOf(res);

    expect(res.status).toBe(200);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('SHIP-9999');
    // `_meta` is legal in both eras, so the code a support conversation joins on
    // survives the projection even though the modern frame does not.
    expect(result._meta?.[MCP_META_KEYS.errorCode]).toBe('ISSUE_NOT_FOUND');
    expect(result.resultType).toBeUndefined();
  });

  it('answers invalid arguments with a tool result, not a protocol error', async () => {
    const res = await post(
      createTestApp(),
      legacyRequest(MCP_METHODS.callTool, {
        name: 'shipyard_list_issues',
        arguments: { limit: 999 },
      }),
      legacyHeaders(),
    );

    expect(res.status).toBe(200);
    expect(bodyOf(res).error).toBeUndefined();
    expect(toolResultOf(res).isError).toBe(true);
    expect(toolResultOf(res).content[0]?.text).toContain('limit');
  });

  it('names the revisions it speaks when the header claims one it does not', async () => {
    // A client from before the revision we answer with. It has no `_meta` for the
    // modern envelope error to complain about, so the version answer has to come
    // first — otherwise it gets told about a field its era never had.
    const res = await post(
      createTestApp(),
      legacyRequest(MCP_METHODS.listTools),
      legacyHeaders({ [MCP_HEADERS.protocolVersion]: '2025-06-18' }),
    );

    expect(res.status).toBe(400);
    expect(bodyOf(res).error?.code).toBe(
      MCP_ERROR_CODES.unsupportedProtocolVersion,
    );
    expect(bodyOf(res).error?.data?.supported).toEqual([
      ...MCP_SUPPORTED_VERSIONS,
    ]);
    expect(bodyOf(res).error?.data?.requested).toBe('2025-06-18');
  });
});

describe('POST /mcp — the modern path is unchanged', () => {
  it('still rejects a mirrored method that disagrees with the body', async () => {
    const res = await post(
      createTestApp(),
      modernBody(MCP_METHODS.listTools),
      modernHeaders(MCP_METHODS.listTools, {
        [MCP_HEADERS.method]: MCP_METHODS.callTool,
      }),
    );

    expect(res.status).toBe(400);
    expect(bodyOf(res).error?.code).toBe(MCP_ERROR_CODES.headerMismatch);
  });

  it('still requires the version header and the tool-name mirror', async () => {
    const missingVersion = await post(
      createTestApp(),
      modernBody(MCP_METHODS.listTools),
      modernHeaders(MCP_METHODS.listTools, {
        [MCP_HEADERS.protocolVersion]: undefined,
      }),
    );
    expect(missingVersion.status).toBe(400);
    expect(bodyOf(missingVersion).error?.code).toBe(
      MCP_ERROR_CODES.headerMismatch,
    );

    const missingName = await post(
      createTestApp(),
      modernBody(MCP_METHODS.callTool, {
        name: 'shipyard_list_issues',
        arguments: {},
      }),
      modernHeaders(MCP_METHODS.callTool),
    );
    expect(missingName.status).toBe(400);
    expect(bodyOf(missingName).error?.message).toContain(MCP_HEADERS.name);
  });

  it('still answers a request with no version signal by naming params._meta', async () => {
    // Neither `_meta` nor the header: deliberately an error rather than an
    // assumption that it is an old client — the sentence names what is missing.
    const res = await post(
      createTestApp(),
      {
        jsonrpc: '2.0',
        id: 'no-signal',
        method: MCP_METHODS.listTools,
        params: {},
      },
      legacyHeaders(HANDSHAKE_HEADERS),
    );

    expect(res.status).toBe(400);
    expect(bodyOf(res).error?.code).toBe(MCP_ERROR_CODES.invalidRequest);
    expect(bodyOf(res).error?.message).toContain('_meta');
  });
  it('holds metadata naming a legacy revision to the modern rules, not the legacy ones', async () => {
    // `_meta` is the modern era's field, so a legacy revision *inside* it is a
    // request claiming two eras at once. It is served as modern — mirrors
    // required, modern frame back — because serving it as legacy is exactly how
    // a caller would opt out of the mirrored-header checks by adding a `_meta`
    // that contradicts its own header.
    const res = await post(
      createTestApp(),
      {
        jsonrpc: '2.0',
        id: 'conflict-1',
        method: MCP_METHODS.listTools,
        params: { _meta: { [VERSION_META_KEY]: MCP_LEGACY_PROTOCOL_VERSION } },
      },
      modernHeaders(MCP_METHODS.listTools, {
        [MCP_HEADERS.protocolVersion]: MCP_LEGACY_PROTOCOL_VERSION,
      }),
    );

    const result = bodyOf(res).result as {
      resultType?: unknown;
      ttlMs?: number;
    };

    expect(res.status).toBe(200);
    // The modern frame is present, which is the evidence that the legacy
    // projection did not happen.
    expect(result.resultType).toBe('complete');
    expect(result.ttlMs).toBeGreaterThan(0);
  });

  it('refuses that same request when its mirrors disagree', async () => {
    const res = await post(
      createTestApp(),
      {
        jsonrpc: '2.0',
        id: 'conflict-2',
        method: MCP_METHODS.listTools,
        params: { _meta: { [VERSION_META_KEY]: MCP_LEGACY_PROTOCOL_VERSION } },
      },
      modernHeaders(MCP_METHODS.listTools, {
        [MCP_HEADERS.protocolVersion]: MCP_PROTOCOL_VERSION,
      }),
    );

    expect(res.status).toBe(400);
    expect(bodyOf(res).error?.code).toBe(MCP_ERROR_CODES.headerMismatch);
  });

  it('answers the modern era’s own discovery unchanged', async () => {
    const res = await post(
      createTestApp(),
      modernBody(MCP_METHODS.discover),
      modernHeaders(MCP_METHODS.discover),
    );

    const result = bodyOf(res).result as {
      resultType?: unknown;
      supportedVersions?: string[];
    };

    expect(res.status).toBe(200);
    expect(result.resultType).toBe('complete');
    expect(result.supportedVersions).toEqual([...MCP_SUPPORTED_VERSIONS]);
  });
});

describe('POST /mcp — one door, two eras', () => {
  /** The credential facts of a refusal, without the per-request id. */
  function refusalOf(body: JsonRpcBody) {
    return { code: body.error?.code, message: body.error?.message };
  }

  it('refuses a revoked credential identically in both eras', async () => {
    await mcpTokensService.revoke(agentContext, agentUserId, agentTokenId);

    const legacy = await post(
      createTestApp(),
      legacyRequest(MCP_METHODS.listTools),
      legacyHeaders(),
    );
    const modern = await post(
      createTestApp(),
      modernBody(MCP_METHODS.listTools),
      modernHeaders(MCP_METHODS.listTools),
    );

    expect(legacy.status).toBe(401);
    expect(modern.status).toBe(401);
    // Identical apart from the request id. An era-specific difference here would
    // be a way to tell the two doors apart — the property the design forbids, and
    // the reason a stolen or stale credential learns nothing from either answer.
    expect(refusalOf(bodyOf(legacy))).toEqual(refusalOf(bodyOf(modern)));
    expect(bodyOf(legacy).error?.code).toBe('UNAUTHORIZED');
  });

  it('refuses a legacy request once its owner is no longer a member', async () => {
    // Membership is checked live on every request, so removing the person kills
    // the credential in both eras without the token row changing.
    await prisma.workspaceMember.delete({
      where: { id: agentContext.memberId },
    });

    const res = await post(
      createTestApp(),
      legacyRequest(MCP_METHODS.listTools),
      legacyHeaders(),
    );

    expect(res.status).toBe(401);
    expect(bodyOf(res).error?.code).toBe('UNAUTHORIZED');
  });

  it('answers GET and DELETE with 405 for both eras', async () => {
    // Era-independent by construction: the route answers before any credential is
    // read, and the measured client treats 405 as fine (M6 probe) — there is no
    // stream to open and no session to end.
    const get = await createTestApp().get(ENDPOINT).set(legacyHeaders());
    const del = await createTestApp().delete(ENDPOINT).set(legacyHeaders());

    expect(get.status).toBe(405);
    expect(del.status).toBe(405);
    expect(get.headers.allow).toBe('POST');
  });
});
