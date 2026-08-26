import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold tracking-tight text-ds-text">
        Forgot your password?
      </h1>
      <p className="text-sm text-ds-text-muted">
        Placeholder — the forgot-password form will live here.
      </p>
    </div>
  );
}
