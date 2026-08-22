import type {
  NextFunction,
  Request as ExpressRequest,
  Response,
} from 'express';
import { AUTH_ERROR_CODES } from '@shipyard/shared';
import { prisma } from '../../common/db/client.js';
import { mapAuthError } from './errors.js';
import { auth } from './auth.js';

/**
 * Auth handler wrapper (mounted at /api/v1/auth/*splat).
 *
 * Better Auth's own handler is the route engine (all endpoints from
 * 04-api-design.md §2 map 1:1); this wrapper adds the Shipyard response
 * contract on top:
 *
 * - Errors → global envelope with AUTH_* codes (04-api-design.md §6).
 * - `POST /sign-out` success → 204 (the spec's status, not Better Auth's 200).
 * - `POST /request-password-reset` for an unknown email → generic 200
 *   (no account-existence leak, 04-api-design.md §3.8).
 * - Everything else (successes, OAuth redirects) passes through untouched.
 *
 * Must run after express.json(): Better Auth's node adapter re-serializes a
 * pre-parsed req.body (better-call getRequest), which the per-email/user
 * rate limiters also depend on.
 */

const SIGN_OUT_PATH = '/api/v1/auth/sign-out';
const REQUEST_PASSWORD_RESET_PATH = '/api/v1/auth/request-password-reset';
const GET_SESSION_PATH = '/api/v1/auth/get-session';
const SIGN_UP_EMAIL_PATH = '/api/v1/auth/sign-up/email';
const JSON_CONTENT_TYPE = /^application\/json/i;

function toWebRequest(req: ExpressRequest): Request {
  const base = `${req.protocol}://${req.get('host') ?? req.headers.host}`;
  const url = new URL(req.originalUrl, base);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }

  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined) {
    body = JSON.stringify(req.body);
  }

  return new Request(url, {
    method: req.method,
    headers,
    body,
  });
}

function sendEnvelope(
  res: Response,
  status: number,
  code: string,
  message: string,
  details: unknown,
  requestId: string | undefined,
): void {
  res.status(status).json({
    error: {
      code,
      message,
      ...(requestId !== undefined ? { requestId } : {}),
      ...(details !== undefined ? { details } : {}),
    },
  });
}

export async function handleAuth(
  req: ExpressRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const requestId = typeof req.id === 'string' ? req.id : undefined;

  // Duplicate sign-up → 400 AUTH_EMAIL_IN_USE (04-api-design.md §3.1).
  // With requireEmailVerification, Better Auth intentionally returns a
  // generic (fabricated) success for existing emails — anti-enumeration.
  // The spec instead surfaces existence at sign-up, so we check up front
  // (the DB unique index still protects the race between check and insert).
  if (req.method === 'POST' && req.path === SIGN_UP_EMAIL_PATH) {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    if (typeof email === 'string') {
      const existing = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { id: true },
      });
      if (existing) {
        sendEnvelope(
          res,
          400,
          AUTH_ERROR_CODES.EMAIL_IN_USE,
          'An account with this email already exists',
          undefined,
          requestId,
        );
        return;
      }
    }
  }

  try {
    const response = await auth.handler(toWebRequest(req));

    // Set response headers (cookies, content-type, ...) minus content-length;
    // res.json()/res.send() recompute it.
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'content-length') return;
      res.setHeader(key, value);
    });

    const status = response.status;

    // 3xx (OAuth authorize redirects, verify-email redirect) pass through.
    if (status >= 300 && status < 400) {
      if (response.headers.get('location')) {
        res.redirect(status, response.headers.get('location')!);
        return;
      }
      res.sendStatus(status);
      return;
    }

    // Success: sign-out → 204 (04-api-design.md §3.5).
    if (
      status >= 200 &&
      status < 300 &&
      req.method === 'POST' &&
      req.path === SIGN_OUT_PATH
    ) {
      res.status(204).end();
      return;
    }

    const contentType = response.headers.get('content-type') ?? '';
    const rawBody = await response.text();

    // Success responses pass through unchanged — except get-session with no
    // session, which is 401 AUTH_UNAUTHORIZED per 04-api-design.md §3.4.
    // (Better Auth returns literal `null` — not { session: null } — for an
    // anonymous get-session in 1.7.)
    if (status < 400) {
      if (
        status === 200 &&
        req.method === 'GET' &&
        req.path === GET_SESSION_PATH &&
        JSON_CONTENT_TYPE.test(contentType)
      ) {
        try {
          const parsed = JSON.parse(rawBody) as
            { session?: unknown } | null | undefined;
          if (
            parsed === null ||
            parsed === undefined ||
            parsed.session === null ||
            parsed.session === undefined
          ) {
            sendEnvelope(
              res,
              401,
              AUTH_ERROR_CODES.UNAUTHORIZED,
              'Authentication required',
              undefined,
              requestId,
            );
            return;
          }
        } catch {
          // fall through to the normal passthrough below
        }
      }

      if (rawBody === '') {
        res.status(status).end();
      } else if (JSON_CONTENT_TYPE.test(contentType)) {
        res.status(status).json(JSON.parse(rawBody) as unknown);
      } else {
        res.status(status).send(rawBody);
      }
      return;
    }

    // Error mapping per 04-api-design.md §6.
    if (JSON_CONTENT_TYPE.test(contentType)) {
      let parsed: { code?: string; message?: string } | undefined;
      try {
        parsed =
          rawBody === ''
            ? undefined
            : (JSON.parse(rawBody) as { code?: string; message?: string });
      } catch {
        parsed = undefined;
      }

      if (parsed?.code) {
        // Generic reset response — never reveal whether the email exists.
        if (
          req.method === 'POST' &&
          req.path === REQUEST_PASSWORD_RESET_PATH &&
          parsed.code === 'USER_NOT_FOUND'
        ) {
          res.status(200).json({});
          return;
        }

        const mapped = mapAuthError(parsed);
        if (mapped !== undefined) {
          sendEnvelope(
            res,
            mapped.status,
            mapped.code,
            mapped.message,
            mapped.details,
            requestId,
          );
          return;
        }

        // Unknown Better Auth code: keep its own code/message inside the
        // envelope instead of misclassifying it.
        sendEnvelope(
          res,
          status,
          parsed.code,
          parsed.message ?? 'Request failed',
          undefined,
          requestId,
        );
        return;
      }
    }

    // Non-JSON error (e.g. error page HTML): pass through, let Express
    // finish with our status handling.
    if (rawBody === '') {
      res.sendStatus(status);
    } else {
      res.status(status).send(rawBody);
    }
  } catch (error) {
    next(error);
  }
}
