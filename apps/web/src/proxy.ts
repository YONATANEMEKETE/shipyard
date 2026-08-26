import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route protection for Shipyard.
 *
 * Two rules, evaluated per request:
 *   1. Unauthenticated users may only reach auth pages — anything else
 *      redirects to /sign-in.
 *   2. Authenticated users are kept out of auth pages — those redirect to
 *      the workspace root.
 *
 * Authentication is checked by session-cookie presence. This is the cheap,
 * edge-friendly signal; cryptographic validation against the API
 * (/api/v1/auth/get-session) lands with the integration pass, at which
 * point this check upgrades without changing the routing rules.
 */

const AUTH_PAGES = [
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/error',
] as const;

// Better Auth names the session cookie differently when useSecureCookies
// is enabled (production), hence the __Secure-prefixed variant.
const SESSION_COOKIES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
] as const;

function isAuthenticated(request: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => request.cookies.has(name));
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`),
  );
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = isAuthenticated(request);
  const onAuthPage = isAuthPage(pathname);

  if (!authed && !onAuthPage) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  if (authed && onAuthPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals and static assets; everything else goes through
  // the protection rules.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|avif|ico|txt|xml)$).*)',
  ],
};
