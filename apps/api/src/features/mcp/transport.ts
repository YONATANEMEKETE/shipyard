import type { NextFunction, Request, Response } from 'express';
import {
  MCP_ERA,
  MCP_LEGACY_METHODS,
  MCP_LEGACY_PROTOCOL_VERSION,
  MCP_META_KEYS,
  MCP_PARAMS_META_KEY,
  eraOfVersion,
  mcpLegacyCallToolResultSchema,
  mcpLegacyInitializeResultSchema,
  mcpLegacyListToolsResultSchema,
  type McpCallToolResult,
  type McpEra,
  type McpLegacyCallToolResult,
  type McpLegacyInitializeResult,
  type McpLegacyListToolsResult,
} from '@shipyard/shared';
import { env } from '../../common/config/env.js';
import { ForbiddenError } from '../../common/errors/httpErrors.js';
import { logger } from '../../common/logger/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// MCP transport layer (F13, M3)
//
// Everything that is about the *HTTP envelope* rather than about JSON-RPC
// messages or tools: this server's identity, the cached discovery metadata, the
// Origin guard, and the header-mirror helpers. Kept apart from `rpc.ts` so the
// message pipeline stays readable and the pure helpers stay unit-testable
// without an app or a database.
//
// See shipyard-design/04-Engineering/features/mcp/api-design.md §4 (guard chain)
// and §5.1 (required headers).
// ─────────────────────────────────────────────────────────────────────────────

// ── Server identity ──

// Advertised in `server/discover` and in every discover result's `_meta`.
// Bump `version` when the advertised tool surface changes materially — clients
// cache discovery, and a version bump is how they learn to re-read it.
export const MCP_SERVER_INFO = {
  name: 'shipyard',
  version: '0.1.0',
} as const;

// The one place cross-tool guidance lives (§5.3). Written for the model that
// will read it: what this server is, when to read by identifier, when to
// search, and the standing rule that identifiers are never invented.
export const MCP_INSTRUCTIONS = [
  'Shipyard is a project-management workspace: issues, projects, cycles, members and activity.',
  'When you already have an identifier such as SHIP-42, read it directly; use the search tool only when you do not know the identifier.',
  'Never invent an identifier — if a lookup reports that something was not found, search for it or ask the person.',
  'A credential is bound to one workspace. Everything you reach belongs to that workspace, and anything you write is attributed to the person who created the credential.',
].join(' ');

// Discovery is static (the registry ships with the binary, ADR-005), so clients
// may hold it for a long time. `tools` is shorter than `discover` because the
// registry changes with a deploy while the business card barely changes at all.
export const MCP_CACHE_TTL_MS = {
  discover: 60 * 60 * 1000,
  tools: 10 * 60 * 1000,
} as const;

// ── The legacy handshake ──

// `initialize` opens a conversation in the legacy era (`2025-11-25` and
// earlier): the handshake established version, identity and capabilities once
// per session. `2026-07-28` removed it — every request now carries its own
// version and identity in `_meta`, and `server/discover` replaces the handshake.
//
// This server serves **both eras** (ADR-005 amendment): the legacy invitation is
// answered with a handshake of our own, statelessly and without an
// `Mcp-Session-Id`, so a client that predates this revision can connect directly
// — while the modern path keeps its per-request metadata and mirror rules
// unchanged. The method name and the era vocabulary are protocol contracts, so
// they live in `packages/shared` and are re-exported here for the pipeline.
export const MCP_HANDSHAKE_METHOD = MCP_LEGACY_METHODS.initialize;

export { MCP_ERA };

// ── Era detection ──

/**
 * What a request says about the revision it was written against. Three places
 * carry it, and the era is derived from all three rather than from a session —
 * this server is stateless, so every request arrives unclassified (ADR-005).
 */
export interface McpEraSignal {
  /** The JSON-RPC method name from the body. */
  readonly method: string;
  /** The request's `params`, when the body had them. */
  readonly params: Record<string, unknown> | undefined;
  /** The `MCP-Protocol-Version` header, when the client sent one. */
  readonly versionHeader: string | undefined;
}

/** Where an era came from. Logged, because that is what a support ticket needs. */
export type McpEraSource = 'handshake' | 'meta' | 'version_header';

/**
 * Why a request could not be classified — each one answerable in its own way: a
 * missing signal is a broken client, an unspoken revision is an old (or future)
 * one, and a conflict is a request claiming two eras at once.
 */
export type McpEraUndeterminedReason =
  'no_version_signal' | 'unsupported_version' | 'era_conflict';

export type McpEraDetection =
  | {
      readonly kind: 'detected';
      readonly era: McpEra;
      readonly source: McpEraSource;
      /** The revision the client claimed, when it claimed a readable one. */
      readonly claimedVersion?: string;
    }
  | {
      readonly kind: 'undetermined';
      readonly reason: McpEraUndeterminedReason;
      readonly claimedVersion?: string;
    };

function trimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

function metaVersionOf(
  params: Record<string, unknown> | undefined,
): string | undefined {
  const meta = params?.[MCP_PARAMS_META_KEY];

  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
    return undefined;
  }

  return trimmedString(
    (meta as Record<string, unknown>)[MCP_META_KEYS.protocolVersion],
  );
}

/**
 * Which era a request belongs to, decided from the request alone.
 *
 * The ordering of these rules is the part that matters:
 *
 *   1. **The handshake is legacy by construction**, whatever revision it
 *      proposes. `initialize` does not exist in `2026-07-28`, so a client that
 *      sends it belongs to the era that has it; the revision it asks for is
 *      settled by negotiation, not by classification.
 *   2. **`params._meta` means modern — and outranks the header.** This is
 *      checked first so a request carrying modern per-request metadata cannot
 *      select the legacy envelope, and thereby skip the mirrored headers, by
 *      naming a legacy revision in a header. Metadata naming a legacy revision
 *      is a request claiming two eras at once, and is answered as such.
 *   3. **Otherwise the version header decides** — the post-handshake shape of
 *      the legacy era, and a legal shape for a modern client that has not read
 *      its own contract.
 *   4. **No signal is `no_version_signal`, deliberately an error** rather than
 *      "assume the oldest era": a modern client that forgets `_meta` must be
 *      told so, not silently reinterpreted as an older client.
 *
 * An unspoken revision never yields an era — {@link eraOfVersion} answers `null`
 * for it — so the caller replies with the revisions it does speak instead of
 * guessing at the nearest one.
 */
export function detectRequestEra(signal: McpEraSignal): McpEraDetection {
  const headerVersion = trimmedString(
    decodeMirrorValue(signal.versionHeader ?? ''),
  );

  // 1. The handshake, and its follow-up notification, name their era outright.
  if (
    signal.method === MCP_LEGACY_METHODS.initialize ||
    signal.method === MCP_LEGACY_METHODS.initialized
  ) {
    const proposed = trimmedString(signal.params?.['protocolVersion']);
    const claimedVersion = proposed ?? headerVersion;

    return {
      kind: 'detected',
      era: MCP_ERA.legacy,
      source: 'handshake',
      ...(claimedVersion === undefined ? {} : { claimedVersion }),
    };
  }

  const metaVersion = metaVersionOf(signal.params);

  // 2. Modern metadata decides — including when it disagrees with itself, which
  //    the mirrored-header rule answers, not this classifier.
  if (metaVersion !== undefined) {
    const claimed = eraOfVersion(metaVersion);

    if (claimed !== MCP_ERA.modern) {
      return {
        kind: 'undetermined',
        reason: claimed === null ? 'unsupported_version' : 'era_conflict',
        claimedVersion: metaVersion,
      };
    }

    return {
      kind: 'detected',
      era: MCP_ERA.modern,
      source: 'meta',
      claimedVersion: metaVersion,
    };
  }

  // 3. No metadata: the header is the only claim, and it must be one we speak.
  if (headerVersion !== undefined) {
    const claimed = eraOfVersion(headerVersion);

    if (claimed === null) {
      return {
        kind: 'undetermined',
        reason: 'unsupported_version',
        claimedVersion: headerVersion,
      };
    }

    return {
      kind: 'detected',
      era: claimed,
      source: 'version_header',
      claimedVersion: headerVersion,
    };
  }

  // 4. Nothing to go on.
  return { kind: 'undetermined', reason: 'no_version_signal' };
}

// ── Era projections ──

/**
 * The handshake answer for the legacy era.
 *
 * Three things are deliberate here. `protocolVersion` is **ours**, not the one
 * the client proposed — that era's negotiation rule is that a server which
 * cannot speak the requested revision answers with one it does, and the client
 * then decides whether to continue. `serverInfo` is top-level, because that era
 * carried identity in the handshake rather than in per-request metadata. And
 * there is **no `Mcp-Session-Id`**: this server is stateless, the revision
 * permits a session-less server, and the shipped client was measured accepting
 * exactly that (M6 probe) rather than assumed to.
 */
export function legacyInitializeResult(): McpLegacyInitializeResult {
  return mcpLegacyInitializeResultSchema.parse({
    protocolVersion: MCP_LEGACY_PROTOCOL_VERSION,
    // The registry ships with the binary (ADR-005), so the tool list cannot
    // change under a connected client and there is nothing to notify about.
    capabilities: { tools: { listChanged: false } },
    serverInfo: MCP_SERVER_INFO,
    instructions: MCP_INSTRUCTIONS,
  });
}

/**
 * A modern tool result in the legacy era's envelope.
 *
 * The schema **is** the projection: it names the fields that era has, so parsing
 * drops the modern frame (`resultType`) and keeps everything that matters — the
 * content, `structuredContent`, `isError`, and the `_meta` diagnostics. Handlers
 * therefore stay era-agnostic: they return the modern shape, and the transport
 * decides what a given client can read.
 */
export function toLegacyToolResult(
  result: McpCallToolResult,
): McpLegacyCallToolResult {
  return mcpLegacyCallToolResultSchema.parse(result);
}

/**
 * `tools/list` in the legacy envelope — the same tools, that era's frame.
 *
 * `server/discover` has no counterpart to project: that era never knew the
 * method, so a client of it cannot receive one.
 */
export function toLegacyListToolsResult(
  result: unknown,
): McpLegacyListToolsResult {
  return mcpLegacyListToolsResultSchema.parse(result);
}

// ── Origin guard ──

const LOOPBACK_ORIGIN =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/u;

function trustedWebOrigin(): string | null {
  try {
    return new URL(env.WEB_URL).origin;
  } catch {
    return null;
  }
}

/**
 * The DNS-rebinding guard the HTTP transport requires (§4).
 *
 * A browser sends `Origin` on every cross-origin request and a non-browser
 * client sends none, so the rule is: **no Origin is fine, an Origin we do not
 * recognise is not.** Rejecting the absent case would break every CLI, editor
 * plugin and local MCP Inspector, while allowing it costs nothing — the header
 * exists to stop a web page in someone's browser from driving this endpoint,
 * and a page can never suppress it.
 *
 * Recognised: the web app's own origin (`WEB_URL`), plus loopback origins
 * outside production so the Inspector (`localhost:6274`) can connect while
 * developing.
 */
export function isTrustedOrigin(origin: string | undefined): boolean {
  if (origin === undefined || origin === '') {
    return true;
  }

  if (origin === trustedWebOrigin()) {
    return true;
  }

  return env.NODE_ENV !== 'production' && LOOPBACK_ORIGIN.test(origin);
}

export function requireTrustedOrigin(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  const origin = request.get('origin') ?? undefined;

  if (isTrustedOrigin(origin)) {
    next();
    return;
  }

  logger.warn(
    {
      requestId: typeof request.id === 'string' ? request.id : undefined,
      origin,
      path: request.originalUrl,
    },
    'mcp.origin.rejected',
  );

  // The platform's own 403, like every other caller-level rejection on this
  // surface (no credential → 401, over budget → 429): the transport answers in
  // JSON-RPC for problems with the *message*, and in the platform envelope for
  // problems with the *caller*. A client can tell the classes apart by status,
  // and a support conversation gets the same shape it gets everywhere else.
  next(
    new ForbiddenError('This origin is not allowed to call the MCP endpoint'),
  );
}

// ── Header mirroring ──

// The spec's optional base64 sentinel: a value that a proxy had to wrap
// (`=?base64?…?=`) is decoded before comparison. v1 uses no `x-mcp-header`
// parameters, so this exists for the day a proxy needs one (§5.1) — and so that
// a mirrored header is compared as the spec says, not as it happens to travel.
const BASE64_SENTINEL = /^=\?base64\?(.*)\?=$/u;

export function decodeMirrorValue(raw: string): string {
  const match = BASE64_SENTINEL.exec(raw);
  if (!match) {
    return raw;
  }

  return Buffer.from(match[1] ?? '', 'base64').toString('utf8');
}

/**
 * Whether a mirrored header agrees with the body value. A missing header never
 * agrees — the caller decides whether that is "missing" (-32020) or "not
 * applicable" per method.
 */
export function mirrorMatches(
  headerValue: string | undefined,
  bodyValue: string,
): boolean {
  if (headerValue === undefined) {
    return false;
  }

  return decodeMirrorValue(headerValue).trim() === bodyValue;
}
