'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signUpRequestSchema, type SignUpRequest } from '@shipyard/shared';
import { Loader2, MailCheck } from 'lucide-react';

import { GitHubIcon, GoogleIcon } from '@/components/auth/provider-icons';
import { ResendVerificationButton } from '@/components/auth/resend-verification-button';
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

/**
 * Email + password sign-up form.
 *
 * Validation is driven by the shared `signUpRequestSchema` so the client and
 * API enforce one contract. Submission is intentionally not wired yet —
 * integration with Better Auth endpoints lands separately.
 */
export function SignUpForm() {
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle');
  const [sentEmail, setSentEmail] = useState<string | null>(null);

  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpRequestSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: SignUpFormValues) => {
    // TODO: POST to the auth endpoint once integration lands; surface
    // envelope errors ({ error: { code, message, details.auth } }) here.
    // With requireEmailVerification on and no callbackURL, the email link
    // points at /verify-email?token=… which handles the post-click flow.
    setStatus('submitting');
    await new Promise((resolve) => setTimeout(resolve, 400));
    setSentEmail(values.email);
  };

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
          <ResendVerificationButton />

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
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
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

            {/* Slot for API error feedback once integration lands */}
            <div aria-live="polite" />

            <Button type="submit" disabled={status === 'submitting'}>
              {status === 'submitting' ? (
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
