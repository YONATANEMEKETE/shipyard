'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgetPasswordRequestSchema } from '@shipyard/shared';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

type ForgotPasswordFormInput = z.input<typeof forgetPasswordRequestSchema>;
type ForgotPasswordFormOutput = z.output<typeof forgetPasswordRequestSchema>;

interface ForgotPasswordFormProps {
  /** Called after a successful (stubbed) submit, with the entered email. */
  onSuccess?: (email: string) => void;
}

/**
 * Password-reset request form.
 *
 * Validation is driven by the shared `forgetPasswordRequestSchema` so the
 * client and API enforce one contract (only `email` is a form field;
 * `redirectTo` is appended server-side when integration lands). Submission
 * is intentionally not wired yet.
 */
export function ForgotPasswordForm({ onSuccess }: ForgotPasswordFormProps) {
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle');

  const form = useForm<
    ForgotPasswordFormInput,
    unknown,
    ForgotPasswordFormOutput
  >({
    resolver: zodResolver(forgetPasswordRequestSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async () => {
    // TODO: POST to the forget-password endpoint once integration lands;
    // surface envelope errors here. On success, show the "check your
    // inbox" variant of this screen (reuse the verify-email layout).
    setStatus('submitting');
    await new Promise((resolve) => setTimeout(resolve, 400));
    setStatus('idle');
    // Email comes from form state; handleSubmit has already validated it.
    const email = form.getValues('email');
    if (email) onSuccess?.(email);
  };

  return (
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

        {/* Slot for API error feedback once integration lands */}
        <div aria-live="polite" />

        <Button type="submit" disabled={status === 'submitting'}>
          {status === 'submitting' ? (
            <>
              <Loader2 className="animate-spin" />
              Sending reset link…
            </>
          ) : (
            'Send reset link'
          )}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{' '}
          <Link
            href="/sign-in"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </Form>
  );
}
