import type { IncomingHttpHeaders } from 'node:http';
// Express's Response is aliased: the unqualified name belongs to fetch, as in
// lib/authNodeHandler.ts.
import type {
  NextFunction,
  Request,
  Response as ExpressResponse,
} from 'express';
import { auth } from '../../lib/auth.js';
import { AppError } from '../../common/errors/AppError.js';
import { mapAuthError } from '../../common/errors/authErrorMap.js';
import { ErrorCodes } from '../../common/errors/codes.js';
import { InternalServerError } from '../../common/errors/httpErrors.js';
import { sendSuccess } from '../../common/http/responses.js';
import { logger } from '../../common/logger/index.js';

/**
 * Auth extension — the routes Better Auth deliberately leaves to the app.
 *
 * `auth.api.setPassword` is declared `createAuthEndpoint.serverOnly`, which
 * removes it from the HTTP surface: called from a browser it answers 404 while
 * `changePassword` and `listAccounts` answer 401. It exists for exactly this
 * case — an account created through Google/GitHub has no credential row, so
 * there is no current password to change, and the only way to give it one
 * without a detour through the reset-email flow is a server-side call.
 *
 * This is mounted under `/api/v1/auth`, **not** `/api/v1/settings`, so the
 * settings module keeps its documented six-route table and its "Settings sends
 * zero requests" property (api-design §5.3). It is Auth filling its own hole.
 *
 * No guard is duplicated here. The cookie is forwarded into better-auth, which
 * runs `sensitiveSessionMiddleware` itself — session validity and freshness are
 * its rules to enforce, and it answers in its own error codes, which
 * `mapAuthError` already translates into our envelope.
 */

/** Mirrors the header conversion in `lib/authNodeHandler.ts`. */
function toWebHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    result.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  return result;
}

async function readAuthError(
  response: Response,
): Promise<{ code?: string; message?: string }> {
  try {
    const body = (await response.json()) as {
      code?: unknown;
      message?: unknown;
    };
    return {
      code: typeof body.code === 'string' ? body.code : undefined,
      message: typeof body.message === 'string' ? body.message : undefined,
    };
  } catch {
    return {};
  }
}

export function setPasswordController(
  request: Request,
  response: ExpressResponse,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const { newPassword } = request.body as { newPassword: string };

      const result = await auth.api.setPassword({
        body: { newPassword },
        headers: toWebHeaders(request.headers),
        asResponse: true,
      });

      if (!result.ok) {
        const { code, message } = await readAuthError(result);
        const mapped = mapAuthError(code, result.status);

        logger.warn(
          {
            errorCode: mapped.code,
            statusCode: mapped.statusCode,
            ...(code !== undefined ? { authErrorCode: code } : {}),
          },
          'Auth request failed',
        );

        throw new AppError(
          mapped.statusCode,
          mapped.code,
          mapped.code === ErrorCodes.INTERNAL_SERVER_ERROR
            ? 'An unexpected error occurred'
            : (message ?? 'Request failed'),
          // Same escape hatch the auth node handler uses, so the client can
          // still tell PASSWORD_ALREADY_SET from a plain conflict.
          { publicDetails: code !== undefined ? { auth: code } : undefined },
        );
      }

      // No password is echoed back, and the caller already knows its own id:
      // the only useful answer is that one now exists.
      sendSuccess(response, { hasPassword: true });
    } catch (error) {
      next(error instanceof AppError ? error : new InternalServerError());
    }
  })();
}
