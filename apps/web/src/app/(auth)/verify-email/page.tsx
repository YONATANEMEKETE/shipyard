import type { Metadata } from 'next';

import { VerifyEmailFlow } from '@/components/auth/verify-email-flow';

export const metadata: Metadata = { title: 'Verify your email' };

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * Landing for the verification email link. The token comes from the URL;
 * the flow component performs verification and shows success or error.
 */
export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const { token } = await searchParams;

  return <VerifyEmailFlow token={token} />;
}
