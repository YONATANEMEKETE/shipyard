import type { SetPasswordRequest } from '@shipyard/shared';

import { requestJson } from '@/lib/api/request';

/**
 * The Auth-side route our API adds for accounts that have no password.
 *
 * Better Auth's own `set-password` is `serverOnly`, so this lives under
 * `/api/v1/auth` — not in `lib/api/settings.ts`, which owns the six
 * account-scoped settings endpoints and nothing else. Everything that needs a
 * current password stays on `authClient.changePassword`.
 *
 * Errors surface as the shared envelope (`VALIDATION_ERROR`,
 * `CONFLICT` + `details.auth = 'PASSWORD_ALREADY_SET'`), which is why the
 * default `ApiError` is enough here.
 */

export interface SetPasswordResult {
  hasPassword: boolean;
}

export function setPassword(
  body: SetPasswordRequest,
): Promise<SetPasswordResult> {
  return requestJson<SetPasswordResult>(
    '/api/v1/auth/set-password',
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to set your password',
  );
}
