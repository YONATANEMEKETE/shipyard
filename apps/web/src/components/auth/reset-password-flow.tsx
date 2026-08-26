'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CircleCheck, TriangleAlert } from 'lucide-react';

import { ResetPasswordForm } from '@/components/auth/reset-password-form';

/**
 * Three-variant reset-password flow, driven by the token in the URL:
 *
 * 1. No token (or a rejected one) → invalid-link notice with a way back
 *    to forgot-password
 * 2. Token present → new-password form (main variant)
 * 3. After a successful submit → updated confirmation
 */
export function ResetPasswordFlow({ token }: { token?: string }) {
  const [invalid, setInvalid] = useState(!token);
  const [updated, setUpdated] = useState(false);

  if (invalid) {
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
            The password reset link is missing, invalid, or has expired. Request
            a fresh one and try again.
          </p>
        </header>

        <Link
          href="/forgot-password"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (updated) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-ds-success-soft text-ds-success">
          <CircleCheck className="size-7" />
        </div>

        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Password updated
          </h1>
          <p className="text-sm leading-[1.5] text-muted-foreground">
            Your password has been changed. Use your new password to sign in.
          </p>
        </header>

        <Link
          href="/sign-in"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Continue to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Choose a new password
        </h1>
        <p className="text-sm leading-[1.5] text-muted-foreground">
          Pick something strong you haven&apos;t used elsewhere. You&apos;ll
          sign in with it from now on.
        </p>
      </header>

      <ResetPasswordForm
        token={token as string}
        onUpdated={() => setUpdated(true)}
        onInvalidToken={() => setInvalid(true)}
      />
    </div>
  );
}
