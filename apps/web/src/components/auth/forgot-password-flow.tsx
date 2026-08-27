'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';

import { AuthStagger, AuthStaggerItem } from '@/components/auth/auth-anim';

import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { ResendVerificationButton } from '@/components/auth/resend-verification-button';
import { authClient } from '@/lib/auth-client';

/**
 * Two-variant forgot-password flow: the request form (main variant), then
 * the "email sent" confirmation shown after a successful submit. Kept as
 * client-side state so the sent view isn't independently bookmarkable.
 */
export function ForgotPasswordFlow() {
  const [sentEmail, setSentEmail] = useState<string | null>(null);

  if (sentEmail !== null) {
    return (
      <AuthStagger className="flex flex-col items-center gap-6 text-center">
        <AuthStaggerItem>
          <div className="grid size-14 place-items-center rounded-full bg-accent text-accent-foreground">
            <MailCheck className="size-7" />
          </div>
        </AuthStaggerItem>

        <AuthStaggerItem>
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
        </AuthStaggerItem>

        <AuthStaggerItem>
          <div className="flex flex-col items-center gap-4">
            <ResendVerificationButton
              label="Resend reset link"
              sentMessage="Reset link sent — check your inbox"
              onResend={() =>
                authClient
                  .requestPasswordReset({
                    email: sentEmail,
                    redirectTo: '/reset-password',
                  })
                  .then((r) => {
                    if (r.error) throw new Error(r.error.message);
                  })
              }
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
        </AuthStaggerItem>
      </AuthStagger>
    );
  }

  return (
    <AuthStagger className="flex flex-col gap-8">
      <AuthStaggerItem>
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Forgot your password?
          </h1>
          <p className="text-sm leading-[1.5] text-muted-foreground">
            Enter the email you signed up with and we&apos;ll send you a link to
            reset your password.
          </p>
        </header>
      </AuthStaggerItem>

      <AuthStaggerItem>
        <ForgotPasswordForm onSuccess={setSentEmail} />
      </AuthStaggerItem>
    </AuthStagger>
  );
}
