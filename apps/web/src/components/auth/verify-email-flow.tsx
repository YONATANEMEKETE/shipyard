'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleCheck, Loader2, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';

type VerifyState = 'verifying' | 'success' | 'error';

/**
 * Post-click landing for the verification email link (`?token=…`).
 *
 * The email link points here directly — no callbackURL round-trip through
 * the API — so this page performs the verification client-side and shows
 * success or error. With autoSignInAfterVerification enabled, a successful
 * verification also sets the session cookie, hence the "continue to your
 * workspace" CTA rather than a sign-in prompt.
 */
export function VerifyEmailFlow({ token }: { token?: string }) {
  const [state, setState] = useState<VerifyState>('verifying');

  useEffect(() => {
    if (!token) return;

    // TODO: POST the token to the verify-email endpoint once integration
    // lands; map failures (expired/invalid) to the error state.
    const timer = setTimeout(() => setState('success'), 900);
    return () => clearTimeout(timer);
  }, [token]);

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-ds-warning-soft text-ds-warning">
          <TriangleAlert className="size-7" />
        </div>

        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            This link isn&apos;t valid
          </h1>
          <p className="text-sm leading-[1.5] text-muted-foreground">
            This verification link is missing, invalid, or has already been
            used. Try signing in — if your email isn&apos;t verified yet, we can
            send a fresh link.
          </p>
        </header>

        <div className="flex items-center gap-3">
          <Button type="button" asChild>
            <Link href="/sign-in">Go to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'verifying') {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-accent text-accent-foreground">
          <Loader2 className="size-7 animate-spin" />
        </div>

        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Verifying your email…
          </h1>
          <p className="text-sm text-muted-foreground">
            One moment while we confirm your address.
          </p>
        </header>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-ds-danger-soft text-ds-danger">
          <TriangleAlert className="size-7" />
        </div>

        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            We couldn&apos;t verify your email
          </h1>
          <p className="text-sm leading-[1.5] text-muted-foreground">
            This link may have expired. Request a new verification email and try
            again.
          </p>
        </header>

        <Button type="button" asChild>
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-ds-success-soft text-ds-success">
        <CircleCheck className="size-7" />
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Email verified
        </h1>
        <p className="text-sm leading-[1.5] text-muted-foreground">
          Your address is confirmed and you&apos;re already signed in. Welcome
          aboard.
        </p>
      </header>

      <Button type="button" asChild>
        <Link href="/">Continue to your workspace</Link>
      </Button>
    </div>
  );
}
