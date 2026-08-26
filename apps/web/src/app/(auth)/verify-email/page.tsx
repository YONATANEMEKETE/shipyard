import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Verify your email' };

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string; callbackURL?: string }>;
}

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const { token, callbackURL } = await searchParams;

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold tracking-tight text-ds-text">
        Verify your email
      </h1>
      <p className="text-sm text-ds-text-muted">
        Placeholder — the verify-email flow will live here.
      </p>
      {token !== undefined && (
        <p className="text-xs text-ds-text-muted">
          Token from query: <code className="font-mono">{token}</code>
        </p>
      )}
      {callbackURL !== undefined && (
        <p className="text-xs text-ds-text-muted">
          Callback: <code className="font-mono">{callbackURL}</code>
        </p>
      )}
    </div>
  );
}
