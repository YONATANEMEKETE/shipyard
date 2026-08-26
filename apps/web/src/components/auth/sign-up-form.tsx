'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signUpRequestSchema, type SignUpRequest } from '@shipyard/shared';
import { Loader2 } from 'lucide-react';

import { GitHubIcon, GoogleIcon } from '@/components/auth/provider-icons';
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
  const router = useRouter();

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
    // For now the happy path routes to the verify-email screen, mirroring
    // where a successful sign-up ends up with requireEmailVerification on.
    setStatus('submitting');
    await new Promise((resolve) => setTimeout(resolve, 400));
    router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
  };

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
  );
}
