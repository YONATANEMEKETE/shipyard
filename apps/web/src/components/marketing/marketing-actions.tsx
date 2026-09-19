'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/use-session';

/**
 * The header's calls to action, which depend on whether the visitor is signed
 * in: a signed-out visitor is offered the way in, a signed-in one is offered
 * the way back to their work.
 *
 * Client-side on purpose. The marketing routes are statically prerendered
 * (`next build` reports `/` and `/changelog` as static), and reading the session
 * during rendering would make every marketing visit a server render against the
 * auth API. `useSession` is the same TanStack Query hook the product uses, so a
 * visitor who signs in and returns to `/` gets the cached answer immediately.
 *
 * While the answer is still in flight the signed-out pair is rendered but kept
 * `invisible`: it reserves the exact space the buttons will occupy (no layout
 * shift) without asserting a state the header has not confirmed yet — nobody
 * sees "Sign in" flash past a signed-in session.
 */
export function MarketingActions() {
  const { data, isPending } = useSession();

  const signedOutActions = (
    <>
      <Button variant="ghost" asChild className="hidden sm:inline-flex">
        <Link href="/sign-in">Sign in</Link>
      </Button>
      <Button asChild>
        <Link href="/sign-up">Get started</Link>
      </Button>
    </>
  );

  if (isPending) {
    return (
      <div aria-hidden className="invisible flex items-center gap-2">
        {signedOutActions}
      </div>
    );
  }

  if (data?.user) {
    // `/w` is the workspace dispatcher: it resolves the selected workspace, sends
    // a first-time user to onboarding, and offers the picker when there is more
    // than one — the same entry point the auth flow redirects to.
    return (
      <Button asChild>
        <Link href="/w">Go to workspace</Link>
      </Button>
    );
  }

  return <div className="flex items-center gap-2">{signedOutActions}</div>;
}
