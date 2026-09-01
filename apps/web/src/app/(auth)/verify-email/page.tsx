import type { Metadata } from 'next';

import { VerifyEmailFlow } from '@/components/auth/verify-email-flow';
import { nextFromCallbackURL } from '@/lib/auth/next-redirect';

export const metadata: Metadata = { title: 'Verify your email' };

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string; callbackURL?: string }>;
}

/**
 * Landing for the verification email link. The token comes from the URL;
 * the flow component performs verification and shows success or error.
 *
 * The invitation flow bakes its resume path (`/invite/:token`) into the
 * email's callbackURL (`callbackURL=/verify-email?next=…`), so `next` is
 * extracted here back out of it and passed down. Verification auto-signs
 * the user in (`autoSignInAfterVerification`), so the flow's success beat
 * can bounce straight to the invitation.
 */
export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const { token, callbackURL } = await searchParams;
  const next = nextFromCallbackURL(callbackURL) ?? undefined;

  return <VerifyEmailFlow token={token} next={next} />;
}
