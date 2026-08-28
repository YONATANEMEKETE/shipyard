'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

import { StatefulButton } from '@/components/motion/button/stateful';
import { authClient } from '@/lib/auth-client';

/**
 * Signs the user out via Better Auth (clears the session server-side and
 * expires the cookie) and returns them to the sign-in screen.
 */
export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const onSignOut = async () => {
    setPending(true);
    try {
      await authClient.signOut();
      // Full redirect so server components re-render unauthenticated.
      router.replace('/sign-in');
    } finally {
      setPending(false);
    }
  };

  return (
    <StatefulButton
      type="button"
      variant="ghost"
      onClick={() => void onSignOut()}
      state={pending ? 'loading' : 'idle'}
      loadingText="Signing out…"
      icon={<LogOut />}
      disabled={pending}
    >
      Sign out
    </StatefulButton>
  );
}
