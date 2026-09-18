import { describe, expect, it } from 'vitest';
import {
  MCP_ERROR_CODES,
  MCP_HEADERS,
  MCP_METHODS,
  MCP_PROTOCOL_VERSION,
  MCP_SUPPORTED_VERSIONS,
  mcpDiscoverResultSchema,
  mcpListToolsResultSchema,
} from '@shipyard/shared';

import { createTestApp } from '../../../helpers/app.js';
import { env } from '../../../../src/common/config/env.js';

/**
 * `POST /mcp` — the transport (api-design §11, "Transport" row).
 *
 * The whole point of this file is the *envelope*: what the endpoint does before
 * any tool exists and before any credential is read (M4). Rows in the database
 * are irrelevant here — the harness still boots its container, but nothing in
 * these assertions depends on it.
 *
 * The gate this proves: an MCP client connects and receives a valid, empty tool
 * list; every malformed request gets the exact status and JSON-RPC code the
 * design promises, so a client can always tell "your request is wrong" (4xx +
 * JSON-RPC error) from "understood and it failed" (200 + `isError`).
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
    code?: number;
    message?: string;
    data?: { supported?: string[]; requested?: string };
  };
}

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
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    Origin: WEB_ORIGIN,
    'Content-Type': 'application/json',
    [MCP_HEADERS.protocolVersion]: MCP_PROTOCOL_VERSION,
    [MCP_HEADERS.method]: method,
    ...overrides,
  };
}

/** One `POST /mcp` with the headers a well-formed client would send. */
async function post(
  request: Request,
  body: unknown,
  overrides: Record<string, string> = {},
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

  it('answers tools/list with an empty, deterministic, private list', async () => {
    const first = await post(createTestApp(), rpcBody(MCP_METHODS.listTools));
    expect(first.status).toBe(200);

    const result = mcpListToolsResultSchema.parse(bodyOf(first).result);
    // The M3 gate: a client connects and gets a *valid* tool list, which is
    // empty until M5 registers the read tools.
    expect(result.tools).toEqual([]);
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

  it('refuses a legacy handshake with the versions it speaks', async () => {
    // A legacy-era client (2025-11-25) opens with `initialize`, verbatim from
    // inspector-cli 2.7.0. This revision removed the handshake, so the answer is
    // the diagnostic the spec prescribes: -32022 naming what this server speaks
    // and what was asked for. For a legacy-only client that message is often the
    // only thing its user will ever see, so it must be actionable — never a
    // success that lets the client fail somewhere confusing instead.
    const res = await post(createTestApp(), {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'inspector-cli', version: '2.7.0' },
      },
    });

    expect(res.status).toBe(400);
    expect(bodyOf(res).error?.code).toBe(
      MCP_ERROR_CODES.unsupportedProtocolVersion,
    );
    expect(bodyOf(res).error?.data?.supported).toEqual([
      ...MCP_SUPPORTED_VERSIONS,
    ]);
    expect(bodyOf(res).error?.data?.requested).toBe('2025-11-25');
    expect(bodyOf(res).error?.message).toContain('server/discover');
  });

  it('answers initialize with unknown-method when the version is one it speaks', async () => {
    // Modern client, legacy shape: the version is fine, the method does not
    // exist — so the error says that, instead of blaming the version.
    const res = await post(createTestApp(), {
      jsonrpc: '2.0',
      id: 'modern-but-initializing',
      method: 'initialize',
      params: { protocolVersion: MCP_PROTOCOL_VERSION },
    });

    expect(res.status).toBe(404);
    expect(bodyOf(res).error?.code).toBe(MCP_ERROR_CODES.methodNotFound);
    expect(bodyOf(res).error?.data?.supported).toEqual([
      ...MCP_SUPPORTED_VERSIONS,
    ]);
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

  it('dispatches without a credential — M3 only; M4 inserts the 401', async () => {
    // Deliberately asserting today's boundary: credential resolution is M4, so
    // discovery is open here. When M4 lands this test flips to `401`, which is
    // the signal that the endpoint may no longer be exposed.
    const res = await post(createTestApp(), rpcBody(MCP_METHODS.discover), {
      Authorization: '',
    });

    expect(res.status).toBe(200);
  });
});

describe('POST /mcp — origin guard', () => {
  it('rejects an untrusted Origin with 403', async () => {
    const res = await post(createTestApp(), rpcBody(MCP_METHODS.discover), {
      Origin: 'https://evil.example.com',
    });

    expect(res.status).toBe(403);
    expect(bodyOf(res).error?.code).toBe(MCP_ERROR_CODES.invalidRequest);
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

    // Agreeing headers get past the mirrors — and then meet the registry, which
    // is empty until M5.
    const agreed = await post(request, call, {
      [MCP_HEADERS.name]: 'shipyard_list_issues',
    });
    expect(agreed.status).toBe(400);
    expect(bodyOf(agreed).error?.code).toBe(MCP_ERROR_CODES.invalidParams);
    expect(bodyOf(agreed).error?.message).toContain('tools/list');
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
