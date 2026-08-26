import type { NextFunction, Request, Response } from 'express';
import { auth } from '../../lib/auth.js';
import { logger } from '../logger/index.js';
import { UnauthorizedError } from '../errors/httpErrors.js';

/**
 * Require an authenticated Better Auth session.
 *
 * Fetches the session from Better Auth using the request headers (cookies),
 * attaches `{ session, user }` to the request, and calls `next()`. When no
 * session is found, responds with a 401 {@link UnauthorizedError}.
 */
export async function requireSession(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
        else headers.set(key, value);
      }
    }

    const result = await auth.api.getSession({ headers });

    if (!result) {
      next(new UnauthorizedError());
      return;
    }

    request.session = result.session;
    request.user = result.user;
    next();
  } catch (error) {
    logger.error({ err: error }, '[requireSession] Failed to fetch session');
    next(error);
  }
}
