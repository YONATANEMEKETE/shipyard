import { useQuery } from '@tanstack/react-query';

import { authClient } from '@/lib/auth-client';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface SessionData {
  user: SessionUser;
  session: { id: string };
}

// ── Query keys ──

export const sessionKeys = {
  all: ['session'] as const,
} as const;

async function fetchSession(): Promise<SessionData | null> {
  const { data, error } = await authClient.getSession();
  if (error || !data?.user) return null;
  return data as unknown as SessionData;
}

export function useSession() {
  return useQuery({
    queryKey: sessionKeys.all,
    queryFn: fetchSession,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
}
