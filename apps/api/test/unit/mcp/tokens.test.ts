import { describe, it, expect } from 'vitest';
import {
  MCP_TOKEN_PREFIX,
  MCP_TOKEN_PREFIX_LENGTH,
  type WorkspaceRole,
} from '@shipyard/shared';
import {
  generateToken,
  hashToken,
  looksLikeToken,
  scopesExceedingRole,
} from '../../../src/features/mcp/tokens.js';

/**
 * Token mechanics (F13, data-model D2/D8). Pure unit tests — no database, no
 * HTTP — because these rules decide whether a credential is recognisable, how
 * it is hashed, and whether it may be minted at all.
 */

describe('generateToken', () => {
  it('mints a prefixed, url-safe credential with a matching hash and prefix', () => {
    const generated = generateToken();

    expect(generated.token.startsWith(MCP_TOKEN_PREFIX)).toBe(true);
    // 32 bytes base64url = 43 chars; prefix + secret = the full credential.
    expect(generated.token.slice(MCP_TOKEN_PREFIX.length)).toHaveLength(43);
    expect(generated.token).toMatch(/^shp_[A-Za-z0-9_-]{43}$/u);

    expect(generated.tokenHash).toBe(hashToken(generated.token));
    expect(generated.tokenHash).toMatch(/^[0-9a-f]{64}$/u);

    expect(generated.tokenPrefix).toHaveLength(MCP_TOKEN_PREFIX_LENGTH);
    expect(generated.token.startsWith(generated.tokenPrefix)).toBe(true);
    // The prefix is a fragment, never the whole secret.
    expect(generated.tokenPrefix).not.toBe(generated.token);
  });

  it('never repeats a credential or a hash across calls', () => {
    const tokens = new Set<string>();
    const hashes = new Set<string>();

    for (let i = 0; i < 50; i += 1) {
      const generated = generateToken();
      tokens.add(generated.token);
      hashes.add(generated.tokenHash);
    }

    expect(tokens.size).toBe(50);
    expect(hashes.size).toBe(50);
  });
});

describe('hashToken', () => {
  it('is deterministic for the same input', () => {
    expect(hashToken('shp_abc')).toBe(hashToken('shp_abc'));
  });

  it('separates inputs that differ by one character', () => {
    expect(hashToken('shp_abc')).not.toBe(hashToken('shp_abd'));
  });

  /**
   * Regression pin: the stored hash format is a contract with every token row
   * ever written. If the algorithm or the encoding changes, existing
   * credentials silently stop resolving — this test fails first.
   */
  it('pins the SHA-256 hex digest of a known input', () => {
    expect(hashToken('shp_regression-check')).toBe(
      '7ced97cdd84b481474ee77055db5b5d9f425f5c5091a43846d16d022c036d55c',
    );
  });
});

describe('looksLikeToken', () => {
  it.each([
    ['shp_abc', true],
    ['shp_', true],
    ['', false],
    ['abc', false],
    ['ghp_abc', false],
    ['Bearer shp_abc', false],
    ['  shp_abc', false],
  ])('classifies %j as %s', (value, expected) => {
    expect(looksLikeToken(value)).toBe(expected);
  });
});

describe('scopesExceedingRole', () => {
  const roles: WorkspaceRole[] = ['OWNER', 'ADMIN', 'MEMBER'];

  it('allows read and member-level writes for every role', () => {
    for (const role of roles) {
      expect(
        scopesExceedingRole(role, ['READ', 'ISSUES_WRITE', 'COMMENTS_WRITE']),
      ).toEqual([]);
    }
  });

  it('reserves ISSUES_DELETE for Owner and Admin', () => {
    expect(scopesExceedingRole('OWNER', ['ISSUES_DELETE'])).toEqual([]);
    expect(scopesExceedingRole('ADMIN', ['ISSUES_DELETE'])).toEqual([]);
    expect(scopesExceedingRole('MEMBER', ['ISSUES_DELETE'])).toEqual([
      'ISSUES_DELETE',
    ]);
  });

  it('names only the offending scopes, so the error can be specific', () => {
    expect(
      scopesExceedingRole('MEMBER', ['READ', 'ISSUES_DELETE', 'ISSUES_WRITE']),
    ).toEqual(['ISSUES_DELETE']);
  });
});
