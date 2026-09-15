import { useQuery } from '@tanstack/react-query';

import { authClient } from '@/lib/auth-client';

/**
 * Which providers this account can sign in with.
 *
 * The `credential` row *is* the password: Better Auth creates it on
 * email/password sign-up and — verified in `dist/api/routes/password.mjs` —
 * on the first password reset for an account that has none. So a missing
 * credential row is what makes "Change password" the wrong verb for an
 * OAuth-only account.
 *
 * This is an Auth read, not a settings one: the settings API surface stays at
 * six routes, and the Security card delegates to Auth screens per the F11 link
 * map (`api-design.md` §5.3).
 */

export interface LinkedAccount {
  providerId: string;
}

export const accountKeys = {
  all: ['auth', 'accounts'] as const,
};

export function useLinkedAccounts() {
  return useQuery({
    queryKey: accountKeys.all,
    queryFn: async (): Promise<LinkedAccount[]> => {
      const { data, error } = await authClient.listAccounts();
      if (error) throw new Error('Failed to load your sign-in methods');
      return (data ?? []) as LinkedAccount[];
    },
    // Held only long enough to be right about a cross-tab flow: setting a
    // password happens through /forgot-password → /reset-password, often in a
    // new tab, so the card has to be willing to re-ask on focus rather than
    // keep insisting there is no password for five minutes.
    staleTime: 0,
  });
}
