'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signInRequestSchema } from '@shipyard/shared';
import { Loader2 } from 'lucide-react';
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

// The schema applies `.default()` to rememberMe, so its input type
// (rememberMe optional) differs from its output (required). RHF's third
// generic carries the post-validation transform.
type SignInFormInput = z.input<typeof signInRequestSchema>;
type SignInFormOutput = z.output<typeof signInRequestSchema>;

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 5.04c1.62 0 3.06.56 4.2 1.64l3.12-3.12C17.46 1.8 14.96.75 12 .75 7.62.75 3.84 3.27 2.04 6.86l3.66 2.84C6.55 7.02 9.05 5.04 12 5.04Z"
      />
      <path
        fill="#4285F4"
        d="M23.25 12.23c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.41 3.57l3.68 2.85c2.15-1.99 3.51-4.92 3.51-8.66Z"
      />
      <path
        fill="#FBBC05"
        d="M5.71 14.29a7.06 7.06 0 0 1 0-4.58L2.04 6.86a11.26 11.26 0 0 0 0 10.28l3.67-2.85Z"
      />
      <path
        fill="#34A853"
        d="M12 23.25c3.04 0 5.6-1 7.46-2.72l-3.68-2.85c-1.02.69-2.33 1.1-3.78 1.1-2.95 0-5.45-1.98-6.3-4.66l-3.66 2.84c1.8 3.6 5.58 6.29 9.96 6.29Z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 .75C5.37.75 0 6.13 0 12.76c0 5.3 3.44 9.79 8.21 11.38.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.04-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.31 3.49 1 .11-.77.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.39 1.24-3.23-.12-.31-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.29-1.23 3.29-1.23.66 1.65.25 2.87.12 3.18.77.84 1.24 1.92 1.24 3.23 0 4.63-2.81 5.64-5.49 5.94.43.37.82 1.1.82 2.22 0 1.61-.02 2.9-.02 3.29 0 .32.22.7.83.58A11.99 11.99 0 0 0 24 12.76C24 6.13 18.63.75 12 .75Z"
      />
    </svg>
  );
}

/**
 * Email + password sign-in form.
 *
 * Validation is driven by the shared `signInRequestSchema` so the client and
 * API enforce one contract. Submission is intentionally not wired yet —
 * integration with Better Auth endpoints lands separately.
 */
export function SignInForm() {
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle');

  const form = useForm<SignInFormInput, unknown, SignInFormOutput>({
    resolver: zodResolver(signInRequestSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: true,
    },
  });

  const onSubmit = async () => {
    setStatus('submitting');
    await new Promise((resolve) => setTimeout(resolve, 400));
    setStatus('idle');
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

          {/* Slot for API error feedback once integration lands */}
          <div aria-live="polite" />

          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? (
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
