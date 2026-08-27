import type { Metadata } from 'next';

import { SignInForm } from '@/components/auth/sign-in-form';
import { AuthStagger, AuthStaggerItem } from '@/components/auth/auth-anim';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <AuthStagger className="flex flex-col gap-8">
      <AuthStaggerItem>
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome back
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your Shipyard workspace.
          </p>
        </header>
      </AuthStaggerItem>

      <AuthStaggerItem>
        <SignInForm />
      </AuthStaggerItem>
    </AuthStagger>
  );
}
