import { describe, expect, it } from 'vitest';

import { parseBearerToken } from '../../../src/features/mcp/auth.js';

/**
 * "What counts as presenting a token" (F13, M4).
 *
 * These rules decide whether a request is answered `401` for the wrong reason,
 * so they are tested away from the request handler they serve: the parsing is
 * strict enough to reject anything that is not a bearer credential, and lenient
 * enough that a normal HTTP client is never refused on a formality.
 */

describe('parseBearerToken', () => {
  it('accepts the canonical form', () => {
    expect(parseBearerToken('Bearer shp_abc123')).toBe('shp_abc123');
  });

  it('accepts the scheme case-insensitively and trims around the value', () => {
    expect(parseBearerToken('bearer shp_abc123')).toBe('shp_abc123');
    expect(parseBearerToken('BEARER shp_abc123')).toBe('shp_abc123');
    expect(parseBearerToken('  Bearer   shp_abc123  ')).toBe('shp_abc123');
  });

  it('rejects a missing or empty header', () => {
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken('')).toBeNull();
    expect(parseBearerToken('   ')).toBeNull();
  });

  it('rejects another scheme', () => {
    // A session cookie arriving as a header, an API key, a Basic credential:
    // none of them is a bearer token, and none may be treated as one.
    expect(parseBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
    expect(parseBearerToken('Token shp_abc123')).toBeNull();
    expect(parseBearerToken('shp_abc123')).toBeNull();
  });

  it('rejects a value containing whitespace', () => {
    // A token is `shp_` plus base64url — never a space. Two values in one
    // header means something upstream concatenated or spoofed them.
    expect(parseBearerToken('Bearer shp_abc 123')).toBeNull();
    expect(parseBearerToken('Bearer shp_a\tshp_b')).toBeNull();
  });

  it('rejects a bare scheme with no value', () => {
    expect(parseBearerToken('Bearer')).toBeNull();
    expect(parseBearerToken('Bearer ')).toBeNull();
  });

  it('does not validate the token shape — that is the service’s job', () => {
    // Parsing decides "is this how one presents a credential", not "is this a
    // credential of ours": the shape check and the hash lookup both live behind
    // `verify`, so an obviously foreign value still parses here.
    expect(parseBearerToken('Bearer not-a-shipyard-token')).toBe(
      'not-a-shipyard-token',
    );
  });
});
