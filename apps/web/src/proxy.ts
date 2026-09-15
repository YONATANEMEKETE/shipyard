import { NextResponse, type NextRequest } from 'next/server';

import { authClient } from '@/lib/auth-client';

/**
 * Route protection for Shipyard.
 *
 * Three tiers:
 *   1. Public — / and /(marketing)/* : always reachable, even authed stays.
 *   2. Auth pages — /(auth)/* : never require a session. Only the credential
 *      entry screens (sign-in/sign-up) bounce an authenticated visitor; the
 *      token-driven ones stay reachable, because a signed-in user is exactly
 *      who uses them (change-email → /verify-email, first password →
 *      /forgot-password → /reset-password).
 *   3. Protected — /onboarding, /select-workspace, /w/*, /settings/* :
 *      unauth → /sign-in. Account Settings is session-scoped but
 *      workspace-free, so it is protected without a workspace context.
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

/**
 * The subset of auth pages that turns an authenticated visitor away.
 *
 * Credential entry only. The others are token- or action-driven and must stay
 * reachable while signed in — a change-email confirmation lands on
 * /verify-email, and setting a first password walks /forgot-password →
 * /reset-password. Bouncing those sent the visitor to /w and discarded the
 * token before the page could consume it, which is the single job those pages
 * exist to do.
 */
const SIGNED_OUT_ONLY_PAGES = ['/sign-in', '/sign-up'] as const;

const PROTECTED_PREFIXES = [
  '/onboarding',
  '/select-workspace',
  '/w',
  '/settings',
] as const;

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

export function isSignedOutOnlyPage(pathname: string): boolean {
  return SIGNED_OUT_ONLY_PAGES.some(
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
    // Reachable either way: no session needed, and a session is no reason to
    // be turned away.
    if (!isSignedOutOnlyPage(pathname)) {
      return NextResponse.next();
    }

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
