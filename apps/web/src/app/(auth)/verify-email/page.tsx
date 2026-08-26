import type { Metadata } from 'next';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';

import { ResendVerificationButton } from '@/components/auth/resend-verification-button';

export const metadata: Metadata = { title: 'Verify your email' };

interface VerifyEmailPageProps {
  searchParams: Promise<{
    email?: string;
    token?: string;
    callbackURL?: string;
  }>;
}

/**
 * "Check your inbox" screen shown after signing up. With
 * requireEmailVerification enabled and autoSignIn disabled, this is where
 * new users land until they click the link in the verification email.
 */
export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const { email } = await searchParams;

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
          We sent a verification link to{' '}
          {email ? (
            <span className="font-medium text-foreground">{email}</span>
          ) : (
            'your inbox'
          )}
          . Open it and click the link to verify your address — then you can
          sign in.
        </p>
      </header>

      <div className="flex flex-col items-center gap-4">
        <ResendVerificationButton />

        <p className="text-sm text-muted-foreground">
          Verified already?{' '}
          <Link
            href="/sign-in"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
