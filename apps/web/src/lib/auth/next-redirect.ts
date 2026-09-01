/**
 * Auth resume redirects — threads the invitation flow through sign-up /
 * sign-in / email-verification and lands the user back on `/invite/:token`
 * to finish accepting.
 *
 * Safety: only internal, single-slash relative paths are allowed. Absolute
 * URLs, protocol-relative URLs (`//host`), scheme-bearing strings, and
 * backslash tricks are rejected so an open redirect can never be forged
 * through a `?next=` parameter.
 */

export function safeInternalPath(
  next: string | null | undefined,
): string | null {
  if (!next) return null;
  if (!next.startsWith('/')) return null;
  if (next.startsWith('//')) return null;
  if (next.includes('\\')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(next)) return null;
  return next;
}

/** `/invite/:token` — the resume target for the invitation flow. */
export function inviteResumePath(token: string): string {
  return `/invite/${token}`;
}

/** `${base}?next=${encoded}` — e.g. `/sign-in?next=/invite/tok123`. */
export function resumeHref(base: string, next: string): string {
  return `${base}?next=${encodeURIComponent(next)}`;
}

/**
 * The verify page is reached as `…/verify-email?token=…&callbackURL=…` —
 * Better Auth bakes the requested callbackURL into the verification link,
 * and the invitation flow requests `callbackURL=/verify-email?next=…`, so
 * the resume path is nested inside the callbackURL query param. Pull it out
 * and validate it before handing it to the router.
 */
export function nextFromCallbackURL(
  callbackURL: string | null | undefined,
): string | null {
  if (!callbackURL) return null;
  try {
    const url = new URL(callbackURL, 'http://local');
    return safeInternalPath(url.searchParams.get('next'));
  } catch {
    return null;
  }
}
