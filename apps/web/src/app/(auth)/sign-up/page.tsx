import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Create account' };

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold tracking-tight text-ds-text">
        Create your account
      </h1>
      <p className="text-sm text-ds-text-muted">
        Placeholder — the sign-up form will live here.
      </p>
    </div>
  );
}
