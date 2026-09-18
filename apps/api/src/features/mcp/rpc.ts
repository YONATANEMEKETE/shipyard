import type { Request } from 'express';
import type { ZodError } from 'zod';
import {
  jsonRpcNotificationSchema,
  jsonRpcRequestSchema,
  MCP_ERROR_CODES,
  MCP_HEADERS,
  MCP_META_KEYS,
  MCP_METHODS,
  MCP_PROTOCOL_VERSION,
  MCP_SUPPORTED_VERSIONS,
  mcpDiscoverResultSchema,
  mcpListToolsResultSchema,
  mcpRequestMetaSchema,
  type McpTokenScope,
} from '@shipyard/shared';
import { RateLimitError } from '../../common/errors/httpErrors.js';
import { logger } from '../../common/logger/index.js';
import { resolveMcpAuth } from './auth.js';
import {
  jsonRpcErrorResponse,
  jsonRpcResult,
  type JsonRpcId,
} from './errors.js';
import { checkTokenRateLimit, rateLimitToolResult } from './rateLimit.js';
import { advertisedTools, findTool } from './registry.js';
import { mcpRequestEnvelopeSchema } from './schemas.js';
import {
  MCP_CACHE_TTL_MS,
  MCP_ERA,
  MCP_HANDSHAKE_METHOD,
  MCP_INSTRUCTIONS,
  MCP_SERVER_INFO,
  mirrorMatches,
} from './transport.js';

// ─────────────────────────────────────────────────────────────────────────────
// The `POST /mcp` pipeline (F13, M3)
//
// One POST /mcp for every JSON-RPC message, in the order the guard chain defines
// (api-design §4):
//
//   content type → envelope shape → notification → method → params._meta →
//   header mirrors → version support → credential → per-token budget → dispatch
//
// As of M4 that chain is complete except for the tools themselves: every request
// that reaches dispatch has been authenticated (bearer token → live membership)
// and counted against its token's budget. The scope filter is M5's, applied
// through the registry to `tools/list` and `tools/call`.
//
// Returning a value instead of writing to the response keeps the pipeline a
// function of the request: the router writes, the tests assert, and there is no
// path that answers twice. Credential failures are the deliberate exception —
// they are *thrown*, so the platform's 401/429 envelopes come from the one
// place that renders errors for both doors.
// ─────────────────────────────────────────────────────────────────────────────

export interface McpHttpResponse {
  status: number;
  /** Absent for `202` — a notification is acknowledged with an empty body. */
  body?: unknown;
  /** Set only where the status needs a companion header (`Retry-After`). */
  headers?: Record<string, string>;
}

function discoverResult(): unknown {
  // Parsed through the shared contract: if the advertised card drifts from what
  // clients were promised, this throws here rather than confusing a client.
  return mcpDiscoverResultSchema.parse({
    resultType: 'complete',
    supportedVersions: [...MCP_SUPPORTED_VERSIONS],
    // Exactly what exists: tools, nothing else. No resources, no prompts, no
    // extensions in v1 (§5.3).
    capabilities: { tools: {} },
    _meta: { [MCP_META_KEYS.serverInfo]: MCP_SERVER_INFO },
    instructions: MCP_INSTRUCTIONS,
    ttlMs: MCP_CACHE_TTL_MS.discover,
    // The business card is identical for every caller, so a shared cache may
    // hold it — unlike `tools/list`, which depends on the credential.
    cacheScope: 'public',
  });
}

function listToolsResult(scopes: readonly McpTokenScope[]): unknown {
  return mcpListToolsResultSchema.parse({
    resultType: 'complete',
    // The credential's scopes prune the list: a read-only token does not even
    // discover the write tools (§5.4, §9). The registry ships empty until M5, so
    // this is the wiring for that filter rather than its effect.
    tools: advertisedTools(scopes),
    ttlMs: MCP_CACHE_TTL_MS.tools,
    // Private: the list depends on the credential, so an intermediary must not
    // serve one caller's tool list to another (§5.4).
    cacheScope: 'private',
  });
}

/**
 * The client's self-reported name, for the log line only — never trusted.
 */
function clientNameOf(raw: unknown): string | undefined {
  const params = (raw as { params?: unknown }).params;
  const meta = (params as { _meta?: unknown } | undefined)?._meta;
  const parsed = mcpRequestMetaSchema.safeParse(meta);

  return parsed.success
    ? parsed.data[MCP_META_KEYS.clientInfo]?.name
    : undefined;
}

/** The version a legacy handshake asked for, from `params.protocolVersion`. */
function versionOf(
  params: Record<string, unknown> | undefined,
): string | undefined {
  const value = params?.protocolVersion;

  return typeof value === 'string' ? value : undefined;
}

/**
 * Handles one message. `request.body` must be the `express.json()` output — a
 * body that could not be parsed never reaches here and is answered by
 * `mcpBodyParseErrorHandler`.
 *
 * Async since M4: the pipeline now reads a credential and a membership before it
 * can dispatch anything.
 */
export async function handleMcpMessage(
  request: Request,
): Promise<McpHttpResponse> {
  const requestId = typeof request.id === 'string' ? request.id : undefined;

  // Null until the envelope parses: a request rejected before that has no id to
  // echo, and JSON-RPC uses null for precisely "could not be read".
  let id: JsonRpcId = null;

  const fail = (
    status: number,
    code: number,
    message: string,
    data?: unknown,
  ): McpHttpResponse => {
    logger.warn(
      { requestId, status, code, reason: message },
      'mcp.protocol.rejected',
    );

    return { status, body: jsonRpcErrorResponse(id, code, message, data) };
  };

  // ── Content type ──
  // Checked before the body, so a form post gets a sentence instead of a
  // confusing "the body is empty".
  const contentType = request.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return fail(
      400,
      MCP_ERROR_CODES.invalidRequest,
      'The MCP endpoint accepts application/json bodies only.',
    );
  }

  // ── Envelope ──
  const raw: unknown = request.body;

  if (raw === null || raw === undefined) {
    return fail(
      400,
      MCP_ERROR_CODES.invalidRequest,
      'The request body is empty — send one JSON-RPC 2.0 message.',
    );
  }

  if (Array.isArray(raw)) {
    return fail(
      400,
      MCP_ERROR_CODES.invalidRequest,
      'Send one JSON-RPC message per request; batching is not supported.',
    );
  }

  if (typeof raw !== 'object' || Object.keys(raw).length === 0) {
    return fail(
      400,
      MCP_ERROR_CODES.invalidRequest,
      'The request body must be one JSON-RPC 2.0 message.',
    );
  }

  // An absent `id` makes this a notification, which the protocol acknowledges
  // with 202 instead of answering.
  const isNotification = !('id' in raw);

  const failEnvelope = (
    error: ZodError,
    notification: boolean,
  ): McpHttpResponse => {
    const issue = error.issues[0];
    const where =
      issue && issue.path.length > 0 ? issue.path.join('.') : 'the body';
    const detail = issue ? issue.message : 'not a JSON-RPC 2.0 message';

    return fail(
      400,
      MCP_ERROR_CODES.invalidRequest,
      `The request is not a valid JSON-RPC 2.0 ${
        notification ? 'notification' : 'request'
      }: ${where} — ${detail}`,
    );
  };

  // ── Envelope shape ──
  // Shape only: a JSON-RPC message with a method. `params._meta` is deliberately
  // not required *yet* — the method has to be one this server implements before
  // it can be held to this server's metadata contract, and a message naming a
  // method we do not have deserves "no such method" rather than a complaint
  // about a field it was never going to send. (Measured, not assumed: the
  // Inspector opens with a legacy `initialize` carrying `params.protocolVersion`
  // and no `_meta`, and answering that with -32600 misreports the problem.)
  let method: string;

  if (isNotification) {
    const notification = jsonRpcNotificationSchema.safeParse(raw);
    if (!notification.success) {
      return failEnvelope(notification.error, true);
    }

    method = notification.data.method;

    // ── Notification ──
    // Answered before anything else, and answered as little as possible:
    // JSON-RPC forbids replying to a notification, the core protocol defines no
    // client→server ones, and the design says they are "tolerated and ignored"
    // (§2 #1). So a well-formed notification gets 202 with no body whatever it
    // names — including the legacy `notifications/initialized` a real client
    // sends during its handshake, which must not be met with an error it cannot
    // read.
    logger.info({ requestId, method }, 'mcp.notification.accepted');

    return { status: 202 };
  }

  const parsedRequest = jsonRpcRequestSchema.safeParse(raw);
  if (!parsedRequest.success) {
    return failEnvelope(parsedRequest.error, false);
  }

  method = parsedRequest.data.method;
  id = parsedRequest.data.id;

  // ── Legacy handshake ──
  // Revisions 2025-11-25 and earlier open with `initialize`; this revision
  // removed it, and no amount of goodwill lets a legacy client be served here —
  // it would negotiate a session that does not exist and then fail somewhere
  // confusing. So the answer is the diagnostic the spec asks for (§4, "the
  // failure path"): the versions this server *does* speak, plus the one that was
  // asked for. For a legacy-only client this message is frequently the only
  // diagnostic its user will ever see.
  //
  // Handled before the mirror checks because a legacy client cannot mirror a
  // method this server does not offer.
  if (method === MCP_HANDSHAKE_METHOD) {
    const requestedVersion = versionOf(parsedRequest.data.params);

    logger.info(
      {
        requestId,
        era: MCP_ERA.legacy,
        clientName: clientNameOf(raw),
        requestedVersion,
        supportedVersions: [...MCP_SUPPORTED_VERSIONS],
      },
      'mcp.handshake.refused',
    );

    if (
      requestedVersion !== undefined &&
      (MCP_SUPPORTED_VERSIONS as readonly string[]).includes(requestedVersion)
    ) {
      // A client asking for a version we speak, over a handshake that no longer
      // exists: the method is the problem, not the version. Say so — and still
      // name what to use instead, because that is what the caller has to act on.
      return fail(
        404,
        MCP_ERROR_CODES.methodNotFound,
        `This server has no "${MCP_HANDSHAKE_METHOD}" handshake — revision ${MCP_PROTOCOL_VERSION} replaced it with server/discover.`,
        { supported: [...MCP_SUPPORTED_VERSIONS] },
      );
    }

    return fail(
      400,
      MCP_ERROR_CODES.unsupportedProtocolVersion,
      `This server speaks ${MCP_SUPPORTED_VERSIONS.join(', ')} only. That revision replaced the "${MCP_HANDSHAKE_METHOD}" handshake with server/discover, so connect with a client that sends server/discover and a ${MCP_HEADERS.protocolVersion} header.`,
      {
        supported: [...MCP_SUPPORTED_VERSIONS],
        ...(requestedVersion !== undefined
          ? { requested: requestedVersion }
          : {}),
      },
    );
  }

  // ── Known method ──
  // 404, not 400: the request was understood — this server simply does not
  // implement that method (§5.2). Checked before the metadata contract so the
  // answer names the real problem.
  if (!(Object.values(MCP_METHODS) as readonly string[]).includes(method)) {
    return fail(
      404,
      MCP_ERROR_CODES.methodNotFound,
      `"${method}" is not a method this server implements. It offers: ${Object.values(
        MCP_METHODS,
      ).join(', ')}.`,
    );
  }

  // ── Envelope metadata ──
  // Now that the method is one of ours: a request must say which revision it was
  // written against, and that is the only place the version travels (§5.1).
  const envelope = mcpRequestEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return failEnvelope(envelope.error, false);
  }

  const params = envelope.data.params;
  const meta = envelope.data.params._meta;
  const metaVersion = meta[MCP_META_KEYS.protocolVersion];

  // ── Header mirrors ──
  // The confused-deputy rule (§5.1): a mirrored header that disagrees with the
  // body is rejected, never reconciled — and a value that travelled wrapped in
  // the base64 sentinel is decoded before the comparison.
  const versionHeader = request.get(MCP_HEADERS.protocolVersion);
  if (versionHeader === undefined) {
    return fail(
      400,
      MCP_ERROR_CODES.headerMismatch,
      `The ${MCP_HEADERS.protocolVersion} header is required and must match the version in params._meta.`,
    );
  }

  if (!mirrorMatches(versionHeader, metaVersion)) {
    return fail(
      400,
      MCP_ERROR_CODES.headerMismatch,
      `The ${MCP_HEADERS.protocolVersion} header does not match the protocol version in params._meta.`,
    );
  }

  const methodHeader = request.get(MCP_HEADERS.method);
  if (methodHeader === undefined) {
    return fail(
      400,
      MCP_ERROR_CODES.headerMismatch,
      `The ${MCP_HEADERS.method} header is required and must name the method being called.`,
    );
  }

  if (!mirrorMatches(methodHeader, method)) {
    return fail(
      400,
      MCP_ERROR_CODES.headerMismatch,
      `The ${MCP_HEADERS.method} header does not match the method in the body.`,
    );
  }

  // `Mcp-Name` mirrors the tool name, so it only exists for `tools/call`.
  if (method === MCP_METHODS.callTool) {
    const toolName = typeof params.name === 'string' ? params.name : '';

    if (toolName === '') {
      return fail(
        400,
        MCP_ERROR_CODES.invalidRequest,
        'tools/call requires params.name — the tool to call.',
      );
    }

    const nameHeader = request.get(MCP_HEADERS.name);
    if (nameHeader === undefined) {
      return fail(
        400,
        MCP_ERROR_CODES.headerMismatch,
        `tools/call requires the ${MCP_HEADERS.name} header, and it must match params.name.`,
      );
    }

    if (!mirrorMatches(nameHeader, toolName)) {
      return fail(
        400,
        MCP_ERROR_CODES.headerMismatch,
        `The ${MCP_HEADERS.name} header does not match params.name.`,
      );
    }
  }

  // ── Version support ──
  // The last transport check, and the one about *this server* rather than about
  // the request: the payload names what the server does speak, so a client
  // written against another revision can correct itself in one round trip.
  if (!(MCP_SUPPORTED_VERSIONS as readonly string[]).includes(metaVersion)) {
    return fail(
      400,
      MCP_ERROR_CODES.unsupportedProtocolVersion,
      `This server speaks ${MCP_SUPPORTED_VERSIONS.join(', ')}, not ${metaVersion}.`,
      // `supported` plus `requested` is the shape the spec prescribes for this
      // error: the client retries with one of the versions it is told about.
      { supported: [...MCP_SUPPORTED_VERSIONS], requested: metaVersion },
    );
  }

  // ── Notification ──
  // The core protocol defines no client→server notifications, so an accepted one
  // does nothing — but it is still acknowledged: 202, no body (§5.2).
  if (isNotification) {
    logger.info(
      { requestId, method, protocolVersion: metaVersion },
      'mcp.notification.accepted',
    );

    return { status: 202 };
  }

  // ── Credential ──
  // The second door (api-design §3.1): who is calling, and where may they act.
  //
  // Thrown, not returned, so the platform's own 401 envelope — the same status,
  // code and body the cookie path produces — is rendered by the global error
  // handler. One rendering path for 401 is deliberate: two credential paths that
  // answer differently are two credential paths that can be told apart, and being
  // unable to tell them apart is the property the design asks for.
  const auth = await resolveMcpAuth(request);

  // ── Per-token budget ──
  // After resolution (there is no key before it) and before any work is done.
  // The breach is answered in whatever channel the method has: a tool result for
  // `tools/call`, so the model is told to pace itself (§8.2), and the platform's
  // 429 for everything else (§5.2).
  const budget = checkTokenRateLimit(auth.credential.tokenId);

  if (!budget.allowed) {
    logger.warn(
      {
        requestId,
        tokenId: auth.credential.tokenId,
        workspaceId: auth.context.workspaceId,
        method,
        retryAfterMs: budget.retryAfterMs,
      },
      'mcp.rate_limit.exceeded',
    );

    if (method === MCP_METHODS.callTool) {
      return {
        status: 200,
        body: jsonRpcResult(id, rateLimitToolResult(budget)),
      };
    }

    // Re-stated rather than thrown, because this pipeline returns values instead
    // of writing to the response — and because the `Retry-After` that makes a 429
    // actionable has to travel with it. Code and message still come from the
    // platform's error, so the wording cannot drift from the other limiters'.
    const limited = new RateLimitError(
      'Too many requests for this agent access token, please try again later',
      { retryAfterMs: budget.retryAfterMs },
      undefined,
      'mcp-token',
    );

    return {
      status: limited.statusCode,
      headers: {
        'Retry-After': String(
          Math.max(1, Math.ceil(budget.retryAfterMs / 1000)),
        ),
      },
      body: {
        error: {
          code: limited.code,
          message: limited.message,
          details: limited.publicDetails,
          ...(requestId !== undefined ? { requestId } : {}),
        },
      },
    };
  }

  // ── Dispatch ──
  switch (method) {
    case MCP_METHODS.discover:
    case MCP_METHODS.listTools: {
      const result =
        method === MCP_METHODS.discover
          ? discoverResult()
          : listToolsResult(auth.credential.scopes);

      logger.info(
        {
          requestId,
          method,
          protocolVersion: metaVersion,
          clientName: meta[MCP_META_KEYS.clientInfo]?.name,
          tokenId: auth.credential.tokenId,
          workspaceId: auth.context.workspaceId,
        },
        'mcp.dispatched',
      );

      return { status: 200, body: jsonRpcResult(id, result) };
    }

    case MCP_METHODS.callTool: {
      const name = typeof params.name === 'string' ? params.name : '';
      const entry = findTool(name);

      if (!entry) {
        // Until M5 registers the read tools this is *every* call — and the
        // protocol's own answer for an unknown name is invalid params, naming
        // what the caller can do instead.
        return fail(
          400,
          MCP_ERROR_CODES.invalidParams,
          `No tool named "${name}". Call tools/list to see the tools this credential can use.`,
        );
      }

      // A registered tool whose handler has not shipped (or whose definition
      // arrived ahead of its wiring): it must never be advertised and then
      // silently dropped, so this is a loud server fault. M5 fills the handlers
      // in and calls them with `auth.credential` and `auth.context` — the same
      // pair every service expects from the cookie path.
      logger.error(
        { requestId, tool: name, id, tokenId: auth.credential.tokenId },
        'mcp.tool.unimplemented',
      );

      return fail(
        500,
        MCP_ERROR_CODES.internalError,
        'That tool is not available yet.',
      );
    }

    default:
      // Unreachable: the known-method check near the top of this pipeline
      // rejects anything outside MCP_METHODS. This is the tripwire for adding a
      // protocol method constant without its case.
      logger.error({ requestId, method }, 'mcp.method.unimplemented');

      return fail(
        500,
        MCP_ERROR_CODES.internalError,
        'That method is not available yet.',
      );
  }
}
