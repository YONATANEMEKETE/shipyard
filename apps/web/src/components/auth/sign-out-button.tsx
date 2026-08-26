'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
    <Button
      type="button"
      variant="outline"
      onClick={() => void onSignOut()}
      disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="animate-spin" />
          Signing out…
        </>
      ) : (
        <>
          <LogOut />
          Sign out
        </>
      )}
    </Button>
  );
}
