'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { GitHubIcon, GoogleIcon } from '@/components/auth/provider-icons';
import { StatefulButton } from '@/components/motion/button/stateful';
import { FormError } from '@/components/ui/form-error';
import { authClient } from '@/lib/auth-client';

type SocialProvider = 'google' | 'github';

const GENERIC_SOCIAL_ERROR =
  'Unable to start sign-in with this provider. Please try again.';

interface SocialButtonsProps {
  /**
   * Where Better Auth should land the user after the OAuth round-trip
   * completes on the API.
   */
  callbackURL?: string;
}

/**
 * Google/GitHub OAuth buttons shared by the sign-in and sign-up forms.
 *
 * Starting the flow redirects the browser to the provider's consent screen;
 * the provider calls back to the API (proxied through the web origin), the
 * session cookie is set, and Better Auth lands the user on callbackURL.
 * Sign-up vs. sign-in is resolved server-side: existing accounts sign in,
 * new identities create an account.
 *
 * The clicked button keeps its spinner through the hand-off to the
 * provider — the mutation settles before the browser actually navigates,
 * so plain isPending would leave a clickable dead gap.
 */
export function SocialButtons({ callbackURL = '/' }: SocialButtonsProps) {
  // Stays set once a flow starts; cleared only on failure. Navigation
  // away tears the page down otherwise.
  const [startedProvider, setStartedProvider] = useState<SocialProvider | null>(
    null,
  );

  const socialMutation = useMutation({
    mutationFn: async (provider: SocialProvider) => {
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL,
      });
      if (error) {
        throw new Error(error.message || GENERIC_SOCIAL_ERROR);
      }
      return provider;
    },
    onError: () => setStartedProvider(null),
  });

  const busy = startedProvider !== null || socialMutation.isPending;

  const isGoogleLoading =
    socialMutation.isPending && socialMutation.variables === 'google';
  const isGithubLoading =
    socialMutation.isPending && socialMutation.variables === 'github';

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <StatefulButton
          type="button"
          variant="outline"
          state={isGoogleLoading ? 'loading' : 'idle'}
          loadingText="Google"
          icon={<GoogleIcon />}
          onClick={() => {
            setStartedProvider('google');
            socialMutation.mutate('google');
          }}
          disabled={busy}
          className="w-full"
        >
          Google
        </StatefulButton>
        <StatefulButton
          type="button"
          variant="outline"
          state={isGithubLoading ? 'loading' : 'idle'}
          loadingText="GitHub"
          icon={<GitHubIcon />}
          onClick={() => {
            setStartedProvider('github');
            socialMutation.mutate('github');
          }}
          disabled={busy}
          className="w-full"
        >
          GitHub
        </StatefulButton>
      </div>

      <FormError
        message={socialMutation.isError ? GENERIC_SOCIAL_ERROR : null}
      />
    </div>
  );
}
