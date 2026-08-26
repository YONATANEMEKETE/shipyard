import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold tracking-tight text-ds-text">
        Sign in
      </h1>
      <p className="text-sm text-ds-text-muted">
        Placeholder — the sign-in form will live here.
      </p>
    </div>
  );
}
