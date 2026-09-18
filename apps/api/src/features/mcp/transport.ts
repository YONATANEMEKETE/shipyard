import type { NextFunction, Request, Response } from 'express';
import { env } from '../../common/config/env.js';
import { logger } from '../../common/logger/index.js';
import { jsonRpcErrorResponse } from './errors.js';
import { MCP_ERROR_CODES } from '@shipyard/shared';

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

// `initialize` belongs to revisions 2025-11-25 and earlier ("legacy era": the
// handshake established version, identity and capabilities once per session).
// `2026-07-28` removed it — every request now carries its own version and
// identity in `_meta`, and `server/discover` replaces the handshake.
//
// So this server never *answers* `initialize` with a result: a legacy client
// would believe it had negotiated something that does not exist, and would fail
// later with a confusing error instead of the real one. It recognizes the method
// only to return the diagnostic the spec asks for — a version error naming what
// this server does speak — because for a legacy-only client that message "may be
// the only diagnostic a user ever sees" (protocol revision 2026-07-28, §4
// "failure path"; see the Model Context Protocol reference note §4).
export const MCP_HANDSHAKE_METHOD = 'initialize';

// The era vocabulary, used in log lines and error copy so a support
// conversation can tell "the client is too old" from "the client is broken".
export const MCP_ERA = {
  modern: 'modern',
  legacy: 'legacy',
} as const;

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
  response: Response,
  next: NextFunction,
): void {
  const origin = request.get('origin') ?? undefined;

  if (isTrustedOrigin(origin)) {
    next();
    return;
  }

  const requestId = typeof request.id === 'string' ? request.id : undefined;

  logger.warn(
    { requestId, origin, path: request.originalUrl },
    'mcp.origin.rejected',
  );

  // Answered in the JSON-RPC shape like every other response on this surface —
  // a client that speaks JSON-RPC should never have to parse a second envelope
  // to learn why it was turned away.
  response
    .status(403)
    .json(
      jsonRpcErrorResponse(
        null,
        MCP_ERROR_CODES.invalidRequest,
        'This origin is not allowed to call the MCP endpoint',
      ),
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
