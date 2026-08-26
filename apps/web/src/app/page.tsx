import { SignOutButton } from '@/components/auth/sign-out-button';

/**
 * Workspace root placeholder. Route protection guarantees an authenticated
 * visitor here; sign-out is wired through Better Auth.
 */
export default function HomePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <SignOutButton />
    </div>
  );
}
