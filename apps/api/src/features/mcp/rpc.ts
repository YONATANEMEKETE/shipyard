import type { Request } from 'express';
import type { ZodError } from 'zod';
import {
  jsonRpcNotificationSchema,
  jsonRpcRequestSchema,
  MCP_ERROR_CODES,
  MCP_HEADERS,
  MCP_LEGACY_METHODS,
  MCP_LEGACY_PROTOCOL_VERSION,
  MCP_META_KEYS,
  MCP_METHODS,
  MCP_SUPPORTED_VERSIONS,
  mcpDiscoverResultSchema,
  mcpLegacyInitializeParamsSchema,
  mcpListToolsResultSchema,
  mcpRequestMetaSchema,
  type McpCallToolResult,
  type McpTokenScope,
} from '@shipyard/shared';
import { RateLimitError } from '../../common/errors/httpErrors.js';
import { logger } from '../../common/logger/index.js';
import { telemetryTracer } from '../../common/telemetry/signals.js';
import { resolveMcpAuth } from './auth.js';
import {
  invalidArgumentsResult,
  jsonRpcErrorResponse,
  jsonRpcResult,
  missingScopeResult,
  toToolResultFromError,
  type JsonRpcId,
} from './errors.js';
import { checkTokenRateLimit, rateLimitToolResult } from './rateLimit.js';
import { advertisedTools, findTool } from './registry.js';
import { mcpRequestEnvelopeSchema } from './schemas.js';
import {
  MCP_CACHE_TTL_MS,
  MCP_ERA,
  MCP_INSTRUCTIONS,
  MCP_SERVER_INFO,
  detectRequestEra,
  legacyInitializeResult,
  mirrorMatches,
  toLegacyListToolsResult,
  toLegacyToolResult,
} from './transport.js';

// ─────────────────────────────────────────────────────────────────────────────
// The `POST /mcp` pipeline (F13)
//
// One POST /mcp for every JSON-RPC message, in the order the guard chain defines
// (api-design §4):
//
//   content type → envelope shape → notification → era → method → [modern era:
//   params._meta → header mirrors → revision support] → credential → per-token
//   budget → dispatch
//
// The era branch (M6) is the shape change since M4. A request says which revision
// it was written against, `detectRequestEra` decides what that means, and the
// checks in brackets belong to the modern era — a legacy client sends no `_meta`
// and no `Mcp-Name` to mirror, which is a fact about that revision rather than a
// concession to it. Everything after the branch is era-blind: one credential, one
// budget, one dispatch, and results are projected into the caller's envelope on
// the way out.
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

/**
 * Every method this server answers, both eras.
 *
 * One list, because the "no such method" answer has to name them all: a legacy
 * client that asks for a modern method should learn that it exists, and a modern
 * one asking for `initialize` should learn the same about the era before it.
 */
const KNOWN_METHODS: readonly string[] = [
  ...Object.values(MCP_METHODS),
  ...Object.values(MCP_LEGACY_METHODS),
];

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
 *
 * It arrives in two places depending on the era, and both are read here so a log
 * aggregator does not have to care which: modern clients put it in per-request
 * `_meta`, and a legacy client announces it once, in the handshake's
 * `params.clientInfo`.
 */
function clientNameOf(raw: unknown): string | undefined {
  const params = (raw as { params?: unknown }).params;
  const meta = (params as { _meta?: unknown } | undefined)?._meta;
  const parsed = mcpRequestMetaSchema.safeParse(meta);

  if (parsed.success) {
    return parsed.data[MCP_META_KEYS.clientInfo]?.name;
  }

  const legacy = mcpLegacyInitializeParamsSchema
    .pick({ clientInfo: true })
    .safeParse({
      clientInfo: (params as { clientInfo?: unknown })?.clientInfo,
    });

  return legacy.success ? legacy.data.clientInfo?.name : undefined;
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

  // ── Era ──
  // Which revision this request was written against, decided from the request
  // itself (`transport.detectRequestEra`): the handshake names its era outright,
  // `params._meta` means modern, and otherwise the version header decides. Both
  // eras send that header on requests after the handshake — measured, not
  // assumed (M6 probe).
  const era = detectRequestEra({
    method,
    params: parsedRequest.data.params,
    versionHeader: request.get(MCP_HEADERS.protocolVersion),
  });

  const legacyEra = era.kind === 'detected' && era.era === MCP_ERA.legacy;

  /**
   * A tool result in the caller's era.
   *
   * Handlers and the error mappers write the modern shape; this is the single
   * place it becomes what the client can actually read. The legacy envelope drops
   * the modern frame (`resultType`) and keeps the content, `isError` and the
   * `_meta` diagnostics (§6.4) — so no handler ever learns which era asked.
   */
  const toolResultForEra = (result: McpCallToolResult): unknown =>
    legacyEra ? toLegacyToolResult(result) : result;

  // The era rides in the log on every request: during dogfooding this line is
  // how a wrong-era client gets identified, and `source` says which signal
  // decided it — a question that otherwise costs a packet capture.
  logger.info(
    {
      requestId,
      method,
      era: era.kind === 'detected' ? era.era : 'undetermined',
      eraSource: era.kind === 'detected' ? era.source : era.reason,
      claimedVersion: era.claimedVersion,
      clientName: clientNameOf(raw),
    },
    'mcp.era.detected',
  );

  // A revision this server does not speak is answered with the ones it does,
  // *before* the envelope rules: the envelope check is a modern-era rule, and a
  // legacy request carries no `_meta` to fail it with a sentence it can act on.
  // This is the one answer that helps a client of either era.
  if (era.kind === 'undetermined' && era.reason === 'unsupported_version') {
    return fail(
      400,
      MCP_ERROR_CODES.unsupportedProtocolVersion,
      `This server speaks ${MCP_SUPPORTED_VERSIONS.join(', ')}, not ${era.claimedVersion ?? 'that revision'}.`,
      {
        supported: [...MCP_SUPPORTED_VERSIONS],
        ...(era.claimedVersion === undefined
          ? {}
          : { requested: era.claimedVersion }),
      },
    );
  }

  // ── Known method ──
  // 404, not 400: the request was understood — this server simply does not
  // implement that method (§5.2). Checked before the metadata contract so the
  // answer names the real problem. Both eras' methods are in `KNOWN_METHODS`.
  if (!KNOWN_METHODS.includes(method)) {
    return fail(
      404,
      MCP_ERROR_CODES.methodNotFound,
      `"${method}" is not a method this server implements. It offers: ${KNOWN_METHODS.join(', ')}.`,
    );
  }

  // ── Envelope metadata ──
  // Modern era only: there, the revision, identity and capabilities travel per
  // request and `_meta` is where they live (§5.1). A legacy request carries its
  // revision in the header and its identity in the handshake, so holding it to
  // this rule would fail it over a field its era never had.
  //
  // A request with *no* version signal lands here too, deliberately: the envelope
  // error names the field that is missing, which is the sentence a modern client
  // needs, and a legacy client that omits the header did not read its own spec.
  let params: Record<string, unknown>;
  let metaVersion: string;

  if (legacyEra) {
    params = parsedRequest.data.params ?? {};
    // The revision this connection negotiated — ours, because the handshake
    // answered with it. It is the era's revision for logging and for the frame of
    // every answer that follows.
    metaVersion = MCP_LEGACY_PROTOCOL_VERSION;
  } else {
    const envelope = mcpRequestEnvelopeSchema.safeParse(raw);
    if (!envelope.success) {
      return failEnvelope(envelope.error, false);
    }

    params = envelope.data.params;
    // Read back through the schema the envelope was parsed with, rather than
    // indexed and asserted: the type and the runtime value then agree by
    // construction instead of by promise.
    metaVersion = mcpRequestMetaSchema.parse(envelope.data.params._meta)[
      MCP_META_KEYS.protocolVersion
    ];
  }

  // ── Modern-era transport checks: mirrored headers, then revision support ──
  // Not applicable to a legacy request, and not by convention: `Mcp-Name` and the
  // version/identity mirrors belong to `2026-07-28` and did not exist in the era
  // before it, so a legacy client has no such fields to send — the shipped
  // Inspector sends `MCP-Protocol-Version` and never `Mcp-Name` (M6 probe). The
  // controls stay at full strength on the modern path, which the transport suite
  // asserts.
  if (!legacyEra) {
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
        body: jsonRpcResult(id, toolResultForEra(rateLimitToolResult(budget))),
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
    // The legacy handshake, answered for the clients that open with it. The one
    // method whose entire answer is era-specific, so it is built by the transport
    // rather than projected from a modern result — and it carries **no session
    // id**: that revision permits a session-less server, and the shipped client
    // was measured accepting exactly that (M6 probe).
    case MCP_LEGACY_METHODS.initialize: {
      logger.info(
        {
          requestId,
          protocolVersion: MCP_LEGACY_PROTOCOL_VERSION,
          clientName: clientNameOf(raw),
          tokenId: auth.credential.tokenId,
          workspaceId: auth.context.workspaceId,
        },
        'mcp.handshake.answered',
      );

      return { status: 200, body: jsonRpcResult(id, legacyInitializeResult()) };
    }

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
          clientName: clientNameOf(raw),
          tokenId: auth.credential.tokenId,
          workspaceId: auth.context.workspaceId,
        },
        'mcp.dispatched',
      );

      return {
        status: 200,
        body: jsonRpcResult(
          id,
          // `server/discover` has no legacy form — that era never knew the method
          // — so only `tools/list` is projected.
          method === MCP_METHODS.listTools && legacyEra
            ? toLegacyListToolsResult(result)
            : result,
        ),
      };
    }

    case MCP_METHODS.callTool: {
      const name = typeof params.name === 'string' ? params.name : '';
      const entry = findTool(name);

      if (entry === undefined) {
        return fail(
          400,
          MCP_ERROR_CODES.invalidParams,
          `No tool named "${name}". Call tools/list to see the tools this credential can use.`,
        );
      }

      // Discovery is scope-filtered, and so is dispatch (§5.4). A tool that is
      // not advertised must not be callable — otherwise the scope list would be
      // advice rather than a gate, and a credential could reach further than the
      // surface it was shown.
      if (!auth.credential.scopes.includes(entry.scope)) {
        logger.warn(
          {
            requestId,
            tool: name,
            tokenId: auth.credential.tokenId,
            requiredScope: entry.scope,
          },
          'mcp.tool.scope_denied',
        );

        return {
          status: 200,
          body: jsonRpcResult(
            id,
            toolResultForEra(missingScopeResult(entry.scope)),
          ),
        };
      }

      // The tool's own contract, checked before anything is read. Argument keys
      // are what the log line gets — never values, which can be a description or
      // an address (§10).
      const rawArguments = (params as { arguments?: unknown }).arguments;
      const argumentKeys =
        typeof rawArguments === 'object' && rawArguments !== null
          ? Object.keys(rawArguments)
          : [];
      const parsed = entry.argumentsSchema.safeParse(rawArguments ?? {});

      // A tool result, not a protocol error: the call was understood, and its
      // arguments are the caller's to get right (§6.3, §8.2).
      if (!parsed.success) {
        logger.info(
          {
            requestId,
            method,
            tool: name,
            tokenId: auth.credential.tokenId,
            argumentKeys,
            invalidArguments: parsed.error.issues.map((issue) =>
              issue.path.join('.'),
            ),
          },
          'mcp.tool.invalid_arguments',
        );

        return {
          status: 200,
          body: jsonRpcResult(
            id,
            toolResultForEra(invalidArgumentsResult(parsed.error)),
          ),
        };
      }

      const startedAt = Date.now();

      // One span per tool execution — the semantic layer the transport spans
      // cannot see. Argument values never land on it: only the tool's name,
      // the era it was called through, and the outcome.
      return telemetryTracer.startActiveSpan(
        'mcp.tool_call',
        {
          attributes: {
            'mcp.tool.name': name,
            'mcp.era': legacyEra ? MCP_ERA.legacy : MCP_ERA.modern,
          },
        },
        async (span) => {
          try {
            const result = await entry.handler(parsed.data, {
              context: auth.context,
              credential: auth.credential,
              ...(requestId !== undefined ? { requestId } : {}),
            });

            span.setAttribute(
              'mcp.result',
              result.isError === true ? 'error' : 'ok',
            );

            logger.info(
              {
                requestId,
                method,
                tool: name,
                tokenId: auth.credential.tokenId,
                workspaceId: auth.context.workspaceId,
                argumentKeys,
                durationMs: Date.now() - startedAt,
                isError: result.isError === true,
                resultBytes: JSON.stringify(result).length,
              },
              'mcp.tool.called',
            );

            return {
              status: 200,
              body: jsonRpcResult(id, toolResultForEra(result)),
            };
          } catch (error) {
            span.setAttribute('mcp.result', 'error');
            span.recordException(
              error instanceof Error ? error : String(error),
            );

            logger.error(
              {
                requestId,
                method,
                tool: name,
                tokenId: auth.credential.tokenId,
                durationMs: Date.now() - startedAt,
                err: error,
              },
              'mcp.tool.failed',
            );

            // A domain failure becomes text the caller can act on; anything else
            // becomes the generic sentence plus the request id — never the driver's
            // own words (§8.2).
            return {
              status: 200,
              body: jsonRpcResult(
                id,
                toolResultForEra(toToolResultFromError(error, requestId)),
              ),
            };
          } finally {
            span.end();
          }
        },
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
