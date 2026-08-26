import type { Metadata } from 'next';

import { ResetPasswordFlow } from '@/components/auth/reset-password-flow';

export const metadata: Metadata = { title: 'Reset password' };

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const { token } = await searchParams;

  return <ResetPasswordFlow token={token} />;
}
