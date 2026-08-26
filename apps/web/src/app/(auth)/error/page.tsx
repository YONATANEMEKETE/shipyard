import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign-in error' };

interface AuthErrorPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function AuthErrorPage({
  searchParams,
}: AuthErrorPageProps) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold tracking-tight text-ds-text">
        Something went wrong
      </h1>
      <p className="text-sm text-ds-text-muted">
        Placeholder — auth error copy and retry actions will live here.
      </p>
      {error !== undefined && (
        <p className="text-xs text-ds-text-muted">
          Reason: <code className="font-mono">{error}</code>
        </p>
      )}
    </div>
  );
}
