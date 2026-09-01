'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CircleCheck, Loader2, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

type VerifyState = 'verifying' | 'success' | 'error';

/**
 * Post-click landing for the verification email link (`?token=…`).
 *
 * The email link points here directly — no callbackURL round-trip through
 * the API — so this page performs the verification client-side. On success
 * it flashes a brief confirmation and automatically continues into the
 * workspace (autoSignInAfterVerification has already set the session
 * cookie by then); there is no manual CTA.
 *
 * `next` is the resume path threaded from the invitation flow via the
 * email's callbackURL (see nextFromCallbackURL) — verification lands the
 * user back on `/invite/:token` instead of the app root.
 */
export function VerifyEmailFlow({
  token,
  next,
}: {
  token?: string;
  next?: string;
}) {
  const [state, setState] = useState<VerifyState>('verifying');
  const router = useRouter();

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const verify = async () => {
      // callbackURL is required for autoSignInAfterVerification to set the
      // session cookie (the JSON-only path skips auto-sign-in). The response
      // body is the followed redirect's HTML — only the error matters here;
      // by this point the browser has already applied the session cookie.
      const { error } = await authClient.verifyEmail({
        query: { token, callbackURL: '/' },
      });
      if (cancelled) return;
      setState(error ? 'error' : 'success');
    };

    void verify();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Success is transient: show the confirmation beat, then continue into
  // the workspace automatically (or back to the invitation being accepted).
  useEffect(() => {
    if (state !== 'success') return;
    const timer = setTimeout(() => router.replace(next ?? '/'), 1400);
    return () => clearTimeout(timer);
  }, [state, router, next]);

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
          Email verified successfully
        </h1>
        <p className="flex items-center justify-center gap-2 text-sm leading-[1.5] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Signing you in…
        </p>
      </header>
    </div>
  );
}
