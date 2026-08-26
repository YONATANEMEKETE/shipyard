import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Reset password' };

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const { token } = await searchParams;

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold tracking-tight text-ds-text">
        Reset your password
      </h1>
      <p className="text-sm text-ds-text-muted">
        Placeholder — the reset-password form will live here.
      </p>
      {token !== undefined && (
        <p className="text-xs text-ds-text-muted">
          Token from query: <code className="font-mono">{token}</code>
        </p>
      )}
    </div>
  );
}
