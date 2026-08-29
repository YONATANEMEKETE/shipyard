import { NextResponse, type NextRequest } from 'next/server';

import { authClient } from '@/lib/auth-client';

/**
 * Route protection for Shipyard.
 *
 * Three tiers:
 *   1. Public — / and /(marketing)/* : always reachable, even authed stays.
 *   2. Auth pages — /(auth)/* : authed users redirect to /.
 *   3. Protected — /onboarding, /select-workspace, /w/* : unauth → /sign-in.
 *
 * Authentication is validated against the Better Auth API (get-session)
 * with the request's own cookies forwarded. A missing session cookie skips
 * the network call entirely; if the API is unreachable we fall back to
 * treating cookie presence as authenticated so a transient API blip doesn't
 * sign everyone out at the door.
 */

const AUTH_PAGES = [
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/error',
] as const;

const PROTECTED_PREFIXES = ['/onboarding', '/select-workspace', '/w'] as const;

// Better Auth names the session cookie differently when useSecureCookies
// is enabled (production), hence the __Secure-prefixed variant.
const SESSION_COOKIES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
] as const;

export function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => request.cookies.has(name));
}

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`),
  );
}

export function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function isAuthenticated(request: NextRequest): Promise<boolean> {
  // Fast path: no session cookie means no valid session — skip the API call
  // that every unauthenticated visit (static assets aside) would otherwise
  // pay for.
  const maybeSession = hasSessionCookie(request);
  if (!maybeSession) {
    return false;
  }

  try {
    const { data } = await authClient.getSession({
      fetchOptions: {
        headers: { cookie: request.headers.get('cookie') ?? '' },
      },
    });
    return Boolean(data?.session);
  } catch {
    // API unreachable — degrade to cookie presence rather than bouncing
    // everyone with a cookie to /sign-in during an API blip.
    return true;
  }
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const onAuthPage = isAuthPage(pathname);
  const onProtected = isProtectedPage(pathname);

  // Public: / and /(marketing)/* — no auth check, even authed users stay.
  // Auth pages: redirect authed → / (but stay public for unauth).
  // Protected: /onboarding, /select-workspace, /w/* — require session.

  if (onAuthPage) {
    const mustValidate = hasSessionCookie(request);
    const authed = mustValidate ? await isAuthenticated(request) : false;
    if (authed) {
      return NextResponse.redirect(new URL('/w', request.url));
    }
    return NextResponse.next();
  }

  if (onProtected) {
    const authed = await isAuthenticated(request);
    if (!authed) {
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }
    return NextResponse.next();
  }

  // Public landing / marketing — no validation, no redirect for authed.
  return NextResponse.next();
}

export const config = {
  // Skip Next internals, static assets, and the same-origin auth API
  // (/api/v1/auth/* must reach its endpoint, never a redirect); everything
  // else goes through the protection rules.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|avif|ico|txt|xml)$).*)',
  ],
};
