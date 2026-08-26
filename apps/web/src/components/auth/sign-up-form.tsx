'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { signUpRequestSchema, type SignUpRequest } from '@shipyard/shared';
import { Loader2, MailCheck } from 'lucide-react';

import { GitHubIcon, GoogleIcon } from '@/components/auth/provider-icons';
import { ResendVerificationButton } from '@/components/auth/resend-verification-button';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

type SignUpFormValues = Pick<SignUpRequest, 'name' | 'email' | 'password'>;

const GENERIC_ERROR = 'Unable to create your account. Please try again.';

/**
 * Email + password sign-up flow.
 *
 * Validation runs against the shared `signUpRequestSchema` so the client
 * and API enforce one contract. On success the form swaps in place to the
 * "check your email" variant — with requireEmailVerification enabled and
 * autoSignIn disabled, no session exists until the user clicks the link.
 */
export function SignUpForm() {
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpRequestSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  });

  const signUpMutation = useMutation({
    mutationFn: async (values: SignUpFormValues) => {
      // With requireEmailVerification on and autoSignIn off, success here
      // returns the created user without a session.
      const { error } = await authClient.signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
      });
      if (error) {
        throw new Error(error.message || GENERIC_ERROR);
      }
      return values.email;
    },
    onSuccess: (email) => {
      setSubmitError(null);
      setSentEmail(email);
    },
    onError: (mutationError) => {
      setSubmitError(
        mutationError instanceof Error ? mutationError.message : GENERIC_ERROR,
      );
    },
  });

  if (sentEmail !== null) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-accent text-accent-foreground">
          <MailCheck className="size-7" />
        </div>

        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Check your email
          </h1>
          <p className="text-sm leading-[1.5] text-muted-foreground">
            We sent a verification link to{' '}
            <span className="font-medium text-foreground">{sentEmail}</span>. Go
            ahead and verify — then you can sign in.
          </p>
        </header>

        <div className="flex flex-col items-center gap-4">
          <ResendVerificationButton
            onResend={() =>
              authClient
                .sendVerificationEmail({
                  email: sentEmail,
                  callbackURL: '/verify-email',
                })
                .then((r) => {
                  if (r.error) throw new Error(r.error.message);
                })
            }
          />

          <p className="text-sm text-muted-foreground">
            Verified already?{' '}
            <Link
              href="/sign-in"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Create your account
        </h1>
        <p className="text-sm text-muted-foreground">
          Start planning, building, and shipping with your team.
        </p>
      </header>

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
              signUpMutation.mutateAsync(values),
            )}
            className="grid gap-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ada Lovelace"
                      autoComplete="name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Must be between 8 and 128 characters.
                  </FormDescription>
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

            <Button type="submit" disabled={signUpMutation.isPending}>
              {signUpMutation.isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Creating account…
                </>
              ) : (
                'Create account'
              )}
            </Button>
          </form>
        </Form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            href="/sign-in"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
