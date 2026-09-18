import { beforeEach, describe, expect, it } from 'vitest';
import {
  MCP_ERROR_CODES,
  MCP_HEADERS,
  MCP_LEGACY_PROTOCOL_VERSION,
  MCP_METHODS,
  MCP_PROTOCOL_VERSION,
  MCP_SUPPORTED_VERSIONS,
  mcpDiscoverResultSchema,
  mcpLegacyInitializeResultSchema,
  mcpListToolsResultSchema,
} from '@shipyard/shared';

import { createTestApp } from '../../../helpers/app.js';
import { resetDatabase } from '../../../helpers/db.js';
import { env } from '../../../../src/common/config/env.js';
import { prisma } from '../../../../src/common/db/client.js';
import type { WorkspaceRequestContext } from '../../../../src/common/guards/workspace-context.js';
import {
  mcpRateLimitConfig,
  resetTokenRateLimits,
} from '../../../../src/features/mcp/rateLimit.js';
import { mcpTokensService } from '../../../../src/features/mcp/service.js';

/**
 * `POST /mcp` — the transport (api-design §11, "Transport" row).
 *
 * What this file proves is the **envelope and the guard chain**: the order the
 * checks run in, the status and code each failure gets, and that a well-formed
 * modern request is dispatched while an unauthenticated one never reaches
 * dispatch (M4).
 *
 * Two answer classes, and a client can tell them apart by status:
 * - **message** problems → JSON-RPC `error` (`-32020`, `-32022`, `-32600`,
 *   `-32601`, `-32602`, `-32700`);
 * - **caller** problems → the platform envelope (`403 FORBIDDEN`,
 *   `401 UNAUTHORIZED`, `429 RATE_LIMITED`), the same shape every other route in
 *   the API answers with.
 *
 * Rows are seeded directly: this layer reads a token and a membership, and how
 * those rows came to exist is the token-management tests' business.
 */

const ENDPOINT = '/mcp';
const WEB_ORIGIN = new URL(env.WEB_URL).origin;
const VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';

type Request = ReturnType<typeof createTestApp>;

interface JsonRpcBody {
  jsonrpc?: string;
  id?: unknown;
  result?: unknown;
  error?: {
    code?: number | string;
    message?: string;
    data?: { supported?: string[]; requested?: string };
    details?: { retryAfterMs?: number };
    requestId?: string;
  };
}

/** The credential every request in this file carries, seeded per test. */
let agentToken = '';
let agentUserId = '';
let agentContext: WorkspaceRequestContext;

beforeEach(async () => {
  await resetDatabase();
  // A fresh budget per test: the limiter is keyed per token in process memory,
  // and a test that exhausts it must not fail its neighbour.
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

  const created = await mcpTokensService.create(agentContext, user.id, {
    label: 'test agent',
    scopes: ['READ'],
  });

  agentToken = created.token;
  agentUserId = user.id;
});

function rpcBody(
  method: string,
  params: Record<string, unknown> = {},
  id: string | number = 'req-1',
): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params: { _meta: { [VERSION_META_KEY]: MCP_PROTOCOL_VERSION }, ...params },
  };
}

function headersFor(
  method: string,
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  const headers: Record<string, string | undefined> = {
    Origin: WEB_ORIGIN,
    'Content-Type': 'application/json',
    [MCP_HEADERS.protocolVersion]: MCP_PROTOCOL_VERSION,
    [MCP_HEADERS.method]: method,
    Authorization: `Bearer ${agentToken}`,
    ...overrides,
  };

  // `undefined` removes a header — the way a test says "a client that does not
  // send this one".
  return Object.fromEntries(
    Object.entries(headers).filter(([, value]) => value !== undefined),
  ) as Record<string, string>;
}

/** One `POST /mcp` with the headers a well-formed, authenticated client sends. */
async function post(
  request: Request,
  body: unknown,
  overrides: Record<string, string | undefined> = {},
) {
  const method =
    typeof body === 'object' && body !== null && 'method' in body
      ? String(body.method)
      : '';

  return request
    .post(ENDPOINT)
    .set(headersFor(method, overrides))
    .send(body as object);
}

function bodyOf(res: { body: unknown }): JsonRpcBody {
  return res.body as JsonRpcBody;
}

describe('POST /mcp — discovery', () => {
  it('answers server/discover with the server card', async () => {
    const res = await post(createTestApp(), rpcBody(MCP_METHODS.discover));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');

    const body = bodyOf(res);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe('req-1');

    // Asserted through the shared contract, then on the values themselves: the
    // shape is the promise to clients, the values are what they actually see.
    const result = mcpDiscoverResultSchema.parse(body.result);
    expect(result.supportedVersions).toEqual([...MCP_SUPPORTED_VERSIONS]);
    expect(result.capabilities.tools).toBeDefined();
    expect(result.instructions).toContain('SHIP-42');
    expect(result.ttlMs).toBeGreaterThan(0);
    // The card is identical for every caller, so a shared cache may hold it.
    expect(result.cacheScope).toBe('public');
    expect(result._meta['io.modelcontextprotocol/serverInfo'].name).toBe(
      'shipyard',
    );
  });

  it('answers tools/list with the registry in its fixed order, deterministically and privately', async () => {
    const first = await post(createTestApp(), rpcBody(MCP_METHODS.listTools));
    expect(first.status).toBe(200);

    const result = mcpListToolsResultSchema.parse(bodyOf(first).result);

    // This fixture's credential carries READ, so the list is the eight read
    // tools in the order the registry declares them — that order is what a
    // client caches against, so it is asserted by name. The write tools are
    // pruned here rather than merely absent, which is its own assertion.
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

    for (const tool of result.tools) {
      // `destructiveHint` defaults to *true* in the spec, so silence would
      // label all eight read tools as destructive.
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.description?.length ?? 0).toBeGreaterThan(40);
    }

    expect(result.ttlMs).toBeGreaterThan(0);
    // Credential-dependent, so an intermediary must not share it.
    expect(result.cacheScope).toBe('private');

    const second = await post(createTestApp(), rpcBody(MCP_METHODS.listTools));
    expect(bodyOf(second).result).toEqual(bodyOf(first).result);
  });

  it('acknowledges a notification with 202 and no body', async () => {
    const res = await post(createTestApp(), {
      jsonrpc: '2.0',
      method: MCP_METHODS.listTools,
      params: { _meta: { [VERSION_META_KEY]: MCP_PROTOCOL_VERSION } },
    });

    expect(res.status).toBe(202);
    expect(res.text).toBe('');
  });

  it('tolerates a bare notification — no _meta, unknown name', async () => {
    // Captured off a real client's handshake (`inspector-cli` 2.7.0):
    // `{"jsonrpc":"2.0","method":"notifications/initialized"}`. JSON-RPC forbids
    // replying to a notification at all, so the only correct HTTP answer is an
    // acknowledgement — not an error the client cannot read.
    const res = await post(createTestApp(), {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    expect(res.status).toBe(202);
    expect(res.text).toBe('');
  });

  it('answers initialize with the legacy handshake even when the client names a modern revision', async () => {
    // The method is the era signal, not the revision it proposes: `initialize`
    // does not exist in `2026-07-28`, so a client sending it belongs to the era
    // that has it. The handshake both eras' clients get is the legacy one, and
    // the full conversation is covered in mcp-legacy-era.
    const res = await post(createTestApp(), {
      jsonrpc: '2.0',
      id: 'modern-but-initializing',
      method: 'initialize',
      params: { protocolVersion: MCP_PROTOCOL_VERSION },
    });

    expect(res.status).toBe(200);
    expect(
      mcpLegacyInitializeResultSchema.parse(bodyOf(res).result).protocolVersion,
    ).toBe(MCP_LEGACY_PROTOCOL_VERSION);
  });

  it('names an unknown method before complaining about a missing _meta', async () => {
    // A request for a method this server does not have is told exactly that —
    // not "your envelope is missing params._meta", which misreports the problem.
    const res = await post(createTestApp(), {
      jsonrpc: '2.0',
      id: 'no-meta-unknown',
      method: 'resources/list',
      params: {},
    });

    expect(res.status).toBe(404);
    expect(bodyOf(res).error?.code).toBe(MCP_ERROR_CODES.methodNotFound);
  });

  it('refuses a request with no credential at all (401)', async () => {
    // M4: credential resolution sits between version support and dispatch, so an
    // unauthenticated request never reaches discovery. The answer is the
    // platform's 401 — the same envelope, status and code the cookie path gives —
    // so the two doors cannot be told apart.
    const res = await post(createTestApp(), rpcBody(MCP_METHODS.discover), {
      Authorization: undefined,
    });

    expect(res.status).toBe(401);
    expect(bodyOf(res).error?.code).toBe('UNAUTHORIZED');
    expect(bodyOf(res).error?.requestId).toBeTruthy();
  });

  it('refuses a live-then-revoked token before dispatch (401)', async () => {
    const request = createTestApp();

    expect((await post(request, rpcBody(MCP_METHODS.discover))).status).toBe(
      200,
    );

    const token = await prisma.mcpToken.findFirstOrThrow({
      where: { workspaceId: agentContext.workspaceId },
    });
    await mcpTokensService.revoke(agentContext, token.userId, token.id);

    const revoked = await post(request, rpcBody(MCP_METHODS.discover));

    expect(revoked.status).toBe(401);
    expect(bodyOf(revoked).error?.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /mcp — origin guard', () => {
  it('rejects an untrusted Origin with 403', async () => {
    const res = await post(createTestApp(), rpcBody(MCP_METHODS.discover), {
      Origin: 'https://evil.example.com',
    });

    expect(res.status).toBe(403);
    // The platform envelope: a *caller* problem, not a message problem.
    expect(bodyOf(res).error?.code).toBe('FORBIDDEN');
  });

  it('rejects an opaque Origin', async () => {
    const res = await post(createTestApp(), rpcBody(MCP_METHODS.discover), {
      Origin: 'null',
    });

    expect(res.status).toBe(403);
  });

  it('accepts a client that sends no Origin at all', async () => {
    const request = createTestApp();
    const headers = headersFor(MCP_METHODS.discover);
    delete headers.Origin;

    const res = await request
      .post(ENDPOINT)
      .set(headers)
      .send(rpcBody(MCP_METHODS.discover));

    expect(res.status).toBe(200);
  });
});

describe('POST /mcp — method and envelope', () => {
  it('answers GET and DELETE with 405 and Allow: POST', async () => {
    const request = createTestApp();

    const getRes = await request.get(ENDPOINT).set('Origin', WEB_ORIGIN);
    expect(getRes.status).toBe(405);
    expect(getRes.headers.allow).toBe('POST');
    expect(bodyOf(getRes).error?.code).toBe(MCP_ERROR_CODES.invalidRequest);

    const deleteRes = await request.delete(ENDPOINT).set('Origin', WEB_ORIGIN);
    expect(deleteRes.status).toBe(405);
    expect(deleteRes.headers.allow).toBe('POST');
  });

  it('answers an unknown method with 404 and -32601', async () => {
    const res = await post(createTestApp(), rpcBody('resources/list'));

    expect(res.status).toBe(404);
    expect(bodyOf(res).error?.code).toBe(MCP_ERROR_CODES.methodNotFound);
    // The sentence lists what this server does implement.
    expect(bodyOf(res).error?.message).toContain(MCP_METHODS.discover);
  });

  it('rejects a batch array', async () => {
    const res = await post(createTestApp(), [rpcBody(MCP_METHODS.discover)]);

    expect(res.status).toBe(400);
    expect(bodyOf(res).error?.code).toBe(MCP_ERROR_CODES.invalidRequest);
    expect(bodyOf(res).error?.message).toContain('batching');
  });

  it('rejects a body with no params._meta', async () => {
    const res = await post(createTestApp(), {
      jsonrpc: '2.0',
      id: 'no-meta',
      method: MCP_METHODS.discover,
      params: {},
    });

    expect(res.status).toBe(400);
    expect(bodyOf(res).error?.code).toBe(MCP_ERROR_CODES.invalidRequest);
    expect(bodyOf(res).error?.message).toContain('params._meta');
  });

  it('rejects an empty body and unparseable JSON, in JSON-RPC', async () => {
    const request = createTestApp();

    const empty = await request
      .post(ENDPOINT)
      .set('Origin', WEB_ORIGIN)
      .set('Content-Type', 'application/json')
      .send('');
    expect(empty.status).toBe(400);
    expect(bodyOf(empty).error?.code).toBe(MCP_ERROR_CODES.invalidRequest);

    // express.json() fails before the router sees anything; this is the
    // app-level handler keeping the answer JSON-RPC.
    const malformed = await request
      .post(ENDPOINT)
      .set('Origin', WEB_ORIGIN)
      .set('Content-Type', 'application/json')
      .send('{"jsonrpc":');
    expect(malformed.status).toBe(400);
    expect(bodyOf(malformed).error?.code).toBe(MCP_ERROR_CODES.parseError);
  });

  it('rejects a non-JSON content type', async () => {
    const request = createTestApp();

    const res = await request
      .post(ENDPOINT)
      .set('Origin', WEB_ORIGIN)
      .set('Content-Type', 'text/plain')
      .send('hello');

    expect(res.status).toBe(400);
    expect(bodyOf(res).error?.code).toBe(MCP_ERROR_CODES.invalidRequest);
    expect(bodyOf(res).error?.message).toContain('application/json');
  });
});

describe('POST /mcp — mirrored headers', () => {
  it('requires MCP-Protocol-Version', async () => {
    const request = createTestApp();
    const headers = headersFor(MCP_METHODS.discover);
    delete headers[MCP_HEADERS.protocolVersion];

    const res = await request
      .post(ENDPOINT)
      .set(headers)
      .send(rpcBody(MCP_METHODS.discover));

    expect(res.status).toBe(400);
    expect(bodyOf(res).error?.code).toBe(MCP_ERROR_CODES.headerMismatch);
    expect(bodyOf(res).error?.message).toContain(MCP_HEADERS.protocolVersion);
  });

  it('requires Mcp-Method', async () => {
    const request = createTestApp();
    const headers = headersFor(MCP_METHODS.discover);
    delete headers[MCP_HEADERS.method];

    const res = await request
      .post(ENDPOINT)
      .set(headers)
      .send(rpcBody(MCP_METHODS.discover));

    expect(res.status).toBe(400);
    expect(bodyOf(res).error?.code).toBe(MCP_ERROR_CODES.headerMismatch);
    expect(bodyOf(res).error?.message).toContain(MCP_HEADERS.method);
  });

  it('rejects a version header that disagrees with params._meta', async () => {
    const res = await post(createTestApp(), rpcBody(MCP_METHODS.discover), {
      [MCP_HEADERS.protocolVersion]: '2026-01-01',
    });

    expect(res.status).toBe(400);
    expect(bodyOf(res).error?.code).toBe(MCP_ERROR_CODES.headerMismatch);
  });

  it('rejects a method header that disagrees with the body', async () => {
    const res = await post(createTestApp(), rpcBody(MCP_METHODS.discover), {
      [MCP_HEADERS.method]: MCP_METHODS.listTools,
    });

    expect(res.status).toBe(400);
    expect(bodyOf(res).error?.code).toBe(MCP_ERROR_CODES.headerMismatch);
    expect(bodyOf(res).error?.message).toContain('does not match');
  });

  it('requires Mcp-Name for tools/call and rejects a disagreement', async () => {
    const request = createTestApp();
    const call = rpcBody(MCP_METHODS.callTool, {
      name: 'shipyard_list_issues',
    });

    const missing = await post(request, call);
    expect(missing.status).toBe(400);
    expect(bodyOf(missing).error?.code).toBe(MCP_ERROR_CODES.headerMismatch);
    expect(bodyOf(missing).error?.message).toContain(MCP_HEADERS.name);

    const mismatch = await post(request, call, {
      [MCP_HEADERS.name]: 'shipyard_delete_issue',
    });
    expect(mismatch.status).toBe(400);
    expect(bodyOf(mismatch).error?.code).toBe(MCP_ERROR_CODES.headerMismatch);

    // Agreeing headers get past the mirrors — and then reach the registry. The
    // tool exists as of M5, so a mirrored call with no arguments is executed;
    // this test is about the mirrors, and a matching pair is meant to get through.
    const agreed = await post(request, call, {
      [MCP_HEADERS.name]: 'shipyard_list_issues',
    });
    expect(agreed.status).toBe(200);
    expect(bodyOf(agreed).result).toBeDefined();

    // A name that is not in the registry is invalid params, naming the way out.
    const unknown = await post(
      request,
      rpcBody(MCP_METHODS.callTool, { name: 'shipyard_delete_issue' }),
      { [MCP_HEADERS.name]: 'shipyard_delete_issue' },
    );
    expect(unknown.status).toBe(400);
    expect(bodyOf(unknown).error?.code).toBe(MCP_ERROR_CODES.invalidParams);
    expect(bodyOf(unknown).error?.message).toContain('tools/list');
  });

  it('answers invalid tool arguments with a tool result, not a protocol error', async () => {
    const request = createTestApp();

    const res = await post(
      request,
      rpcBody(MCP_METHODS.callTool, {
        name: 'shipyard_list_issues',
        arguments: { limit: 999 },
      }),
      { [MCP_HEADERS.name]: 'shipyard_list_issues' },
    );

    // 200: the message was understood, and the arguments are the caller's to fix
    // (§6.3, §8.2). A 4xx here would tell a model to give up on a tool it can use.
    expect(res.status).toBe(200);
    expect(bodyOf(res).error).toBeUndefined();

    const result = bodyOf(res).result as {
      isError?: boolean;
      content: { type: string; text?: string }[];
    };
    const text = result.content
      .map((block) => (block.type === 'text' ? (block.text ?? '') : ''))
      .join('\n');

    expect(result.isError).toBe(true);
    expect(text).toContain('limit');
    expect(text).toContain('Call the tool again');
  });

  it('accepts mirrored values that arrive base64-wrapped', async () => {
    const wrap = (value: string): string =>
      `=?base64?${Buffer.from(value, 'utf8').toString('base64')}?=`;

    const res = await post(createTestApp(), rpcBody(MCP_METHODS.discover), {
      [MCP_HEADERS.protocolVersion]: wrap(MCP_PROTOCOL_VERSION),
      [MCP_HEADERS.method]: wrap(MCP_METHODS.discover),
    });

    expect(res.status).toBe(200);
  });
});

describe('POST /mcp — protocol version', () => {
  it('rejects an unsupported version with -32022 and the supported list', async () => {
    const unsupported = '2025-06-18';
    const body = {
      jsonrpc: '2.0',
      id: 'old-client',
      method: MCP_METHODS.discover,
      params: { _meta: { [VERSION_META_KEY]: unsupported } },
    };

    const res = await post(createTestApp(), body, {
      [MCP_HEADERS.protocolVersion]: unsupported,
    });

    expect(res.status).toBe(400);
    expect(bodyOf(res).error?.code).toBe(
      MCP_ERROR_CODES.unsupportedProtocolVersion,
    );
    // The payload names what this server does speak, and what was asked for, so
    // a client written against another revision corrects itself in one round trip.
    expect(bodyOf(res).error?.data?.supported).toEqual([
      ...MCP_SUPPORTED_VERSIONS,
    ]);
    expect(bodyOf(res).error?.data?.requested).toBe(unsupported);
  });
});

describe('POST /mcp — per-token budget', () => {
  it('answers 429 with Retry-After once a token exceeds its budget', async () => {
    const request = createTestApp();
    const { max } = mcpRateLimitConfig;

    for (let index = 0; index < max; index += 1) {
      const allowed = await post(request, rpcBody(MCP_METHODS.discover));
      expect(allowed.status).toBe(200);
    }

    const limited = await post(request, rpcBody(MCP_METHODS.discover));

    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    // The platform's rate-limit answer, with the pacing hint in both the header
    // and the body: discovery has no tool-result channel to carry it.
    expect(bodyOf(limited).error?.code).toBe('RATE_LIMITED');
    expect(bodyOf(limited).error?.details?.retryAfterMs).toBeGreaterThan(0);
  });

  it('counts per token, not per client', async () => {
    const request = createTestApp();
    const { max } = mcpRateLimitConfig;

    for (let index = 0; index < max; index += 1) {
      const allowed = await post(request, rpcBody(MCP_METHODS.discover));
      expect(allowed.status).toBe(200);
    }

    expect((await post(request, rpcBody(MCP_METHODS.discover))).status).toBe(
      429,
    );

    // A second connection from the same client — same IP, same app — is
    // untouched: the budget belongs to the credential, which is the only
    // identity this surface has (agents share an IP by definition).
    const second = await mcpTokensService.create(agentContext, agentUserId, {
      label: 'second agent',
      scopes: ['READ'],
    });

    const res = await post(request, rpcBody(MCP_METHODS.discover), {
      Authorization: `Bearer ${second.token}`,
    });

    expect(res.status).toBe(200);
  });

  it('does not charge a refused request to a budget', async () => {
    // Nothing is counted before the credential is resolved, so a caller with no
    // credential cannot exhaust anything — including someone else's.
    const request = createTestApp();

    const refused = await post(request, rpcBody(MCP_METHODS.discover), {
      Authorization: undefined,
    });
    expect(refused.status).toBe(401);

    const allowed = await post(request, rpcBody(MCP_METHODS.discover));
    expect(allowed.status).toBe(200);
  });
});
