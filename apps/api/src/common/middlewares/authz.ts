import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../features/auth/auth.js';
import { AuthUnauthorizedError } from '../../features/auth/errors.js';
import { ForbiddenError } from '../errors/httpErrors.js';
import { logger } from '../logger/index.js';

/**
 * Session-context middleware (04-api-design.md §4).
 *
 * The authenticated context resolved here — req.auth — is the trust anchor
 * for every other module's guards (workspace scoping, RBAC). It is derived
 * from the session cookie server-side, never from client input.
 */

export interface AuthContext {
  session: NonNullable<
    Awaited<ReturnType<typeof auth.api.getSession>>
  >['session'];
  user: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>['user'];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Resolve the session from the request cookie and attach it to req.auth.
 * Non-blocking where the caller only needs the identity for keying.
 */
export async function resolveSession(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (session) {
      req.auth = session;
    }
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Require a valid session: 401 AUTH_UNAUTHORIZED when missing/expired.
 * Attaches req.auth = { session, user } on success. Every protected route
 * in every module composes this first (04-api-design.md §4).
 */
export const requireSession: RequestHandler = (req, res, next) => {
  if (req.auth !== undefined) {
    next();
    return;
  }

  auth.api
    .getSession({ headers: fromNodeHeaders(req.headers) })
    .then((session) => {
      if (!session) {
        next(new AuthUnauthorizedError());
        return;
      }
      req.auth = session;
      next();
    })
    .catch(next);
};

/**
 * Workspace membership guard (04-api-design.md §4).
 *
 * STUB until F3 (members module) lands: the workspace membership and role
 * tables do not exist yet, so this cannot enforce anything. It deliberately
 * fails closed — invoking it before F3 is a programming error, not a
 * security hole.
 *
 * F3 contract (do not change the signature):
 *   workspaceId ← resolved from the route (params/body) — a lookup key,
 *   never proof of access; membership is checked against the session's
 *   userId; non-members get 403 without leaking resource existence.
 */
export function requireWorkspaceMember(
  workspaceId: string | ((request: Request) => string | undefined),
): RequestHandler {
  void workspaceId; // consumed by F3's membership check; used today only via
  // the contract signature.
  return (_req, _res, next) => {
    logger.warn(
      'requireWorkspaceMember invoked before F3 (members) is implemented — failing closed',
    );
    next(new ForbiddenError('Workspace membership is not implemented yet'));
  };
}

/** PRD roles (shipped by members/RBAC, F3). */
export type WorkspaceRole = 'owner' | 'admin' | 'member';

/**
 * Role guard (04-api-design.md §4).
 *
 * STUB until F3 (members/RBAC) lands — same contract and fail-closed rule
 * as requireWorkspaceMember. The role matrix (PRD) is enforced here once
 * membership rows exist.
 */
export function requireRole(...roles: WorkspaceRole[]): RequestHandler {
  void roles; // consumed by F3's role matrix; used today only via the
  // contract signature.
  return (_req, _res, next) => {
    logger.warn(
      'requireRole invoked before F3 (members/RBAC) is implemented — failing closed',
    );
    next(new ForbiddenError('Role checks are not implemented yet'));
  };
}
