import type { NextFunction, Request, Response } from 'express';
import type { WorkspaceRole } from '@shipyard/shared';
import { ForbiddenRoleError } from '../../features/workspace/errors.js';

/**
 * Guard against a resolved workspace context (`req.workspaceContext` from
 * {@link resolveWorkspaceContext}) for the required roles. In F2 the only role
 * is OWNER; F3 widens the enum (ADMIN, MEMBER) without changing this guard.
 *
 * Returns `403 FORBIDDEN_ROLE` when the caller's membership role is not in
 * `allowedRoles`. Must run after `resolveWorkspaceContext`.
 */
export function requireWorkspaceRole(...allowedRoles: WorkspaceRole[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const context = request.workspaceContext;

    if (!context) {
      // Defensive: context must already be resolved and attached.
      next(new ForbiddenRoleError());
      return;
    }

    if (!allowedRoles.includes(context.role)) {
      next(new ForbiddenRoleError());
      return;
    }

    next();
  };
}
