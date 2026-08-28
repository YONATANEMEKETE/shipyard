import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock authClient before importing proxy
const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { getSession: getSessionMock },
}));

const {
  hasSessionCookie,
  isAuthPage,
  isProtectedPage,
  isAuthenticated,
  default: proxy,
  config,
} = await import('@/proxy');

function makeRequest(
  url: string,
  cookies: Record<string, string> = {},
): NextRequest {
  const request = new NextRequest(new URL(url, 'http://localhost:3000'), {
    headers: {
      cookie: Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
    },
  });
  // Populate NextRequest cookies jar from header for hasSessionCookie()
  for (const [name, value] of Object.entries(cookies)) {
    request.cookies.set(name, value);
  }
  return request;
}

describe('hasSessionCookie', () => {
  it('returns true for better-auth.session_token', () => {
    const req = makeRequest('http://localhost:3000/', {
      'better-auth.session_token': 'abc',
    });
    expect(hasSessionCookie(req)).toBe(true);
  });

  it('returns true for __Secure-better-auth.session_token', () => {
    const req = makeRequest('http://localhost:3000/', {
      '__Secure-better-auth.session_token': 'xyz',
    });
    expect(hasSessionCookie(req)).toBe(true);
  });

  it('returns false when no session cookie present', () => {
    const req = makeRequest('http://localhost:3000/', { other: 'val' });
    expect(hasSessionCookie(req)).toBe(false);
  });

  it('returns false for empty cookies', () => {
    const req = makeRequest('http://localhost:3000/');
    expect(hasSessionCookie(req)).toBe(false);
  });
});

describe('isAuthPage', () => {
  it.each([
    '/sign-in',
    '/sign-up',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/error',
  ])('matches auth page %s exactly', (page) => {
    expect(isAuthPage(page)).toBe(true);
  });

  it.each([
    '/sign-in/',
    '/sign-in/foo',
    '/verify-email/token/extra',
    '/error/500',
  ])('matches subpath %s', (path) => {
    expect(isAuthPage(path)).toBe(true);
  });

  it.each([
    '/',
    '/dashboard',
    '/api/v1/auth/sign-in',
    '/sign-in-other',
    '/_next/static/chunk.js',
  ])('does not match non-auth path %s', (path) => {
    expect(isAuthPage(path)).toBe(false);
  });
});

describe('isProtectedPage', () => {
  it.each([
    '/onboarding',
    '/select-workspace',
    '/w',
    '/w/abc',
    '/w/my-workspace/settings',
  ])('matches protected page %s', (path) => {
    expect(isProtectedPage(path)).toBe(true);
  });

  it.each(['/onboarding/', '/select-workspace/invite'])(
    'matches protected subpath %s',
    (path) => {
      expect(isProtectedPage(path)).toBe(true);
    },
  );

  it.each([
    '/',
    '/sign-in',
    '/pricing',
    '/about',
    '/api/v1/workspaces',
    '/workspace',
    '/onboarding-other',
  ])('does not match non-protected path %s', (path) => {
    expect(isProtectedPage(path)).toBe(false);
  });
});

describe('isAuthenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false without session cookie without calling API', async () => {
    const req = makeRequest('http://localhost:3000/dashboard');
    const result = await isAuthenticated(req);
    expect(result).toBe(false);
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('calls getSession with forwarded cookie and returns true when session exists', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { id: 's1' } } });
    const req = makeRequest('http://localhost:3000/dashboard', {
      'better-auth.session_token': 'tok',
    });
    // Ensure cookie header is present for forwarding
    req.headers.set('cookie', 'better-auth.session_token=tok');

    const result = await isAuthenticated(req);

    expect(getSessionMock).toHaveBeenCalledOnce();
    const callArg = getSessionMock.mock.calls[0]?.[0] as {
      fetchOptions: { headers: { cookie: string } };
    };
    expect(callArg.fetchOptions.headers.cookie).toBe(
      'better-auth.session_token=tok',
    );
    expect(result).toBe(true);
  });

  it('returns false when API returns no session', async () => {
    getSessionMock.mockResolvedValue({ data: null });
    const req = makeRequest('http://localhost:3000/', {
      'better-auth.session_token': 'tok',
    });
    req.headers.set('cookie', 'better-auth.session_token=tok');

    const result = await isAuthenticated(req);
    expect(result).toBe(false);
  });

  it('degrades to true when API throws (transient blip)', async () => {
    getSessionMock.mockRejectedValue(new Error('network'));
    const req = makeRequest('http://localhost:3000/', {
      'better-auth.session_token': 'tok',
    });

    const result = await isAuthenticated(req);
    expect(result).toBe(true);
  });

  it('forwards empty cookie header when none present but session cookie exists via jar', async () => {
    // Simulate cookie in jar but not in header (edge case)
    getSessionMock.mockResolvedValue({ data: { session: { id: 's1' } } });
    const req = makeRequest('http://localhost:3000/', {
      'better-auth.session_token': 'tok',
    });
    req.headers.delete('cookie');

    const result = await isAuthenticated(req);
    expect(result).toBe(true);
    const callArg = getSessionMock.mock.calls[0]?.[0] as {
      fetchOptions: { headers: { cookie: string } };
    };
    expect(callArg.fetchOptions.headers.cookie).toBe('');
  });
});

describe('proxy routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects unauthenticated protected page to /sign-in', async () => {
    const req = makeRequest('http://localhost:3000/onboarding');
    const res = await proxy(req);
    expect(res instanceof NextResponse).toBe(true);
    expect(res.headers.get('location')).toBe('http://localhost:3000/sign-in');
    expect(res.status).toBe(307); // NextResponse.redirect default
  });

  it('redirects unauthenticated select-workspace to /sign-in', async () => {
    const req = makeRequest('http://localhost:3000/select-workspace');
    const res = await proxy(req);
    expect(res.headers.get('location')).toBe('http://localhost:3000/sign-in');
  });

  it('redirects unauthenticated workspace page to /sign-in', async () => {
    const req = makeRequest('http://localhost:3000/w/my-workspace');
    const res = await proxy(req);
    expect(res.headers.get('location')).toBe('http://localhost:3000/sign-in');
  });

  it('allows unauthenticated public landing through', async () => {
    const req = makeRequest('http://localhost:3000/');
    const res = await proxy(req);
    expect(res.headers.get('location')).toBeNull();
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('allows unauthenticated marketing page through', async () => {
    const req = makeRequest('http://localhost:3000/pricing');
    const res = await proxy(req);
    expect(res.headers.get('location')).toBeNull();
  });

  it('allows unauthenticated auth page through (fast path, no validation)', async () => {
    const req = makeRequest('http://localhost:3000/sign-in');
    const res = await proxy(req);
    // NextResponse.next() has x-middleware-next header
    expect(res.headers.get('location')).toBeNull();
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('redirects authenticated auth page to /', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { id: 's1' } } });
    const req = makeRequest('http://localhost:3000/sign-in', {
      'better-auth.session_token': 'tok',
    });
    req.headers.set('cookie', 'better-auth.session_token=tok');

    const res = await proxy(req);
    expect(res.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('allows authenticated protected page through', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { id: 's1' } } });
    const req = makeRequest('http://localhost:3000/w/my-workspace', {
      'better-auth.session_token': 'tok',
    });
    req.headers.set('cookie', 'better-auth.session_token=tok');

    const res = await proxy(req);
    expect(res.headers.get('location')).toBeNull();
  });

  it('allows authenticated public landing through (no redirect to workspace)', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { id: 's1' } } });
    const req = makeRequest('http://localhost:3000/', {
      'better-auth.session_token': 'tok',
    });
    req.headers.set('cookie', 'better-auth.session_token=tok');

    const res = await proxy(req);
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects auth subpath when authenticated', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { id: 's1' } } });
    const req = makeRequest('http://localhost:3000/sign-up/extra', {
      'better-auth.session_token': 'tok',
    });

    const res = await proxy(req);
    expect(res.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('degrades to authenticated on API failure so cookie bearer stays on protected page', async () => {
    getSessionMock.mockRejectedValue(new Error('api down'));
    const req = makeRequest('http://localhost:3000/w/my-workspace', {
      'better-auth.session_token': 'tok',
    });

    const res = await proxy(req);
    expect(res.headers.get('location')).toBeNull();
  });
});

describe('config.matcher', () => {
  it('excludes api, _next/static, and static assets', () => {
    expect(config.matcher).toHaveLength(1);
    expect(config.matcher[0]).toContain('api');
    expect(config.matcher[0]).toContain('_next/static');
  });
});
