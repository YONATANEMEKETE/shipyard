import type { Metadata } from 'next';

import { SignUpForm } from '@/components/auth/sign-up-form';

export const metadata: Metadata = { title: 'Create account' };

interface SignUpPageProps {
  searchParams: Promise<{ next?: string }>;
}

/**
 * `?next=` carries the resume path (e.g. `/invite/:token` from the
 * invitation flow). The form bakes it into the verification email callback
 * URL so the user lands back there once their email is verified.
 */
export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const { next } = await searchParams;

  return <SignUpForm next={next} />;
}
