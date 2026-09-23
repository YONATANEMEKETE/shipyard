'use client';

import { useEffect } from 'react';

import { useSession } from '@/hooks/use-session';
import { identifyAnalyticsUser, resetAnalytics } from '@/lib/posthog';

/**
 * Keeps PostHog's person in step with the session: `identify` while someone is
 * signed in, `reset` once the session query has answered with nobody. The reset
 * is what stops a shared browser from merging two people's histories — and the
 * `undefined` guard is what keeps it from firing while the answer is still in
 * flight, which would rotate the id of a person who is in fact signed in.
 *
 * It renders nothing, and it reads the session through the same TanStack Query
 * key the rest of the app uses — so it adds no request of its own.
 */
export function AnalyticsIdentity() {
  const { data: session } = useSession();
  const userId = session?.user.id;

  useEffect(() => {
    if (userId) {
      identifyAnalyticsUser(userId);
      return;
    }

    // `undefined` = the query has not answered yet; `null` = answered, nobody
    // is signed in.
    if (session === undefined) return;

    resetAnalytics();
  }, [userId, session]);

  return null;
}
