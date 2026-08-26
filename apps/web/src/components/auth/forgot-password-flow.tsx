'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';

import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { ResendVerificationButton } from '@/components/auth/resend-verification-button';

/**
 * Two-variant forgot-password flow: the request form (main variant), then
 * the "email sent" confirmation shown after a successful submit. Kept as
 * client-side state so the sent view isn't independently bookmarkable.
 */
export function ForgotPasswordFlow() {
  const [sentEmail, setSentEmail] = useState<string | null>(null);

  if (sentEmail !== null) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-accent text-accent-foreground">
          <MailCheck className="size-7" />
        </div>

        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Check your email
          </h1>
          <p className="text-sm leading-[1.5] text-muted-foreground">
            We sent a password reset link to{' '}
            <span className="font-medium text-foreground">{sentEmail}</span>.
            The link expires in 1 hour.
          </p>
        </header>

        <div className="flex flex-col items-center gap-4">
          <ResendVerificationButton
            label="Resend reset link"
            sentMessage="Reset link sent — check your inbox"
          />

          <p className="text-sm text-muted-foreground">
            <Link
              href="/sign-in"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Forgot your password?
        </h1>
        <p className="text-sm leading-[1.5] text-muted-foreground">
          Enter the email you signed up with and we&apos;ll send you a link to
          reset your password.
        </p>
      </header>

      <ForgotPasswordForm onSuccess={setSentEmail} />
    </div>
  );
}
