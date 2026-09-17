import { createHash, randomBytes } from 'node:crypto';
import {
  MCP_SCOPE_MIN_ROLE,
  MCP_TOKEN_BYTES,
  MCP_TOKEN_PREFIX,
  MCP_TOKEN_PREFIX_LENGTH,
  type McpTokenScope,
  type WorkspaceRole,
} from '@shipyard/shared';

/**
 * Token mechanics for the MCP module (F13, data-model D2/D8).
 *
 * Deliberately dependency-free (node:crypto + shared constants only) so the
 * rules that decide whether a credential is well-formed and whether it may be
 * minted are unit-testable without a database, and reusable by the `/mcp` auth
 * step (M4) without importing service code.
 *
 * What lives here: generating a token, hashing a presented token, recognising
 * the token shape, and the issuance ceiling. What does **not** live here:
 * anything that touches Prisma, and anything that knows about HTTP.
 */

export interface GeneratedToken {
  /** The plaintext credential — returned to the member exactly once. */
  token: string;
  /** What gets stored: SHA-256 of the plaintext, hex. */
  tokenHash: string;
  /** The cleartext fragment kept for recognition and log redaction. */
  tokenPrefix: string;
}

/**
 * Mints a new credential: 32 CSPRNG bytes, base64url, prefixed so it is
 * recognisable on sight (`shp_…` — data-model D8).
 *
 * The hash is SHA-256 and not a password KDF on purpose: the input is 256 bits
 * of randomness, so there is no guessable space to attack offline, and the
 * lookup happens on every MCP request. If token values ever become
 * member-chosen, this decision must be revisited together with a slow KDF
 * (data-model D2).
 */
export function generateToken(): GeneratedToken {
  const secret = randomBytes(MCP_TOKEN_BYTES).toString('base64url');
  const token = `${MCP_TOKEN_PREFIX}${secret}`;

  return {
    token,
    tokenHash: hashToken(token),
    tokenPrefix: token.slice(0, MCP_TOKEN_PREFIX_LENGTH),
  };
}

/** The single hashing rule — generation, verification and any future display
 *  path must all agree, so it exists exactly once. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Cheap shape check used before a database lookup: an obviously foreign value
 *  never costs a query. Not a security control — the hash lookup is. */
export function looksLikeToken(value: string): boolean {
  return value.startsWith(MCP_TOKEN_PREFIX);
}

/**
 * The issuance ceiling (api-design §3.2): which requested scopes exceed what
 * the caller's workspace role allows. Returns the offending scopes so the
 * error can name them, rather than a bare boolean.
 *
 * This is a convenience gate, never the security boundary — the role check
 * runs again on every action, so a member whose role is later downgraded loses
 * the ability even though the token still carries the scope.
 */
export function scopesExceedingRole(
  role: WorkspaceRole,
  scopes: McpTokenScope[],
): McpTokenScope[] {
  const canAdminister = role === 'OWNER' || role === 'ADMIN';

  return scopes.filter(
    (scope) => MCP_SCOPE_MIN_ROLE[scope] === 'ADMIN' && !canAdminister,
  );
}
