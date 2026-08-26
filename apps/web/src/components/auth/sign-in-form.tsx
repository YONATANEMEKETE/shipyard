'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signInRequestSchema } from '@shipyard/shared';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { GitHubIcon, GoogleIcon } from '@/components/auth/provider-icons';
import { authClient } from '@/lib/auth-client';

// The schema applies `.default()` to rememberMe, so its input type
// (rememberMe optional) differs from its output (required). RHF's third
// generic carries the post-validation transform.
type SignInFormInput = z.input<typeof signInRequestSchema>;
type SignInFormOutput = z.output<typeof signInRequestSchema>;

const GENERIC_SIGN_IN_ERROR = 'Unable to sign in. Please try again.';

/**
 * Email + password sign-in form.
 *
 * Validation is driven by the shared `signInRequestSchema` so the client
 * and API enforce one contract. Submission goes through Better Auth's
 * sign-in endpoint; the API answers with the shared error envelope, whose
 * message is surfaced inline.
 */
export function SignInForm() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const router = useRouter();

  const form = useForm<SignInFormInput, unknown, SignInFormOutput>({
    resolver: zodResolver(signInRequestSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: true,
    },
  });

  const signInMutation = useMutation({
    mutationFn: async (values: SignInFormOutput) => {
      const { error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
        rememberMe: values.rememberMe,
      });
      if (!error) return;

      // The API answers with the shared envelope; better-fetch spreads that
      // body onto the client error, so code/message/details live under
      // error.error.*. Map to user-friendly copy here.
      const envelope = (
        error as unknown as {
          status?: number;
          error?: { message?: string; details?: { auth?: string } };
        }
      ).error;
      const authCode = envelope?.details?.auth;

      if (authCode === 'EMAIL_NOT_VERIFIED') {
        throw new Error(
          'Please verify your email address before signing in — check your inbox.',
        );
      }
      if (error.status === 429) {
        throw new Error(
          'Too many attempts. Please wait a moment and try again.',
        );
      }
      if (error.status === 401 || error.status === 400) {
        throw new Error('Invalid email or password.');
      }
      throw new Error(envelope?.message ?? GENERIC_SIGN_IN_ERROR);
    },
    onSuccess: () => {
      // Session cookie is set; replace so the authenticated root renders.
      router.replace('/');
    },
    onError: (mutationError) => {
      setSubmitError(
        mutationError instanceof Error
          ? mutationError.message
          : GENERIC_SIGN_IN_ERROR,
      );
    },
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Social providers */}
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline">
          <GoogleIcon />
          Google
        </Button>
        <Button type="button" variant="outline">
          <GitHubIcon />
          GitHub
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) =>
            signInMutation.mutateAsync(values),
          )}
          className="grid gap-4"
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Password</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="rememberMe"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Checkbox
                    checked={field.value ?? true}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true)
                    }
                  />
                </FormControl>
                <FormLabel className="font-normal text-muted-foreground">
                  Keep me signed in
                </FormLabel>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* API error feedback (envelope message surfaces here) */}
          <div aria-live="polite">
            {submitError !== null && (
              <p className="text-xs text-destructive">{submitError}</p>
            )}
          </div>

          <Button type="submit" disabled={signInMutation.isPending}>
            {signInMutation.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link
          href="/sign-up"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
