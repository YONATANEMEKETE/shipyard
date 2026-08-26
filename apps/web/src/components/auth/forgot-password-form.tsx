'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { forgetPasswordRequestSchema } from '@shipyard/shared';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';

import { authClient } from '@/lib/auth-client';

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

const GENERIC_REQUEST_ERROR =
  'Unable to send the reset link. Please try again.';

type ForgotPasswordFormInput = z.input<typeof forgetPasswordRequestSchema>;
type ForgotPasswordFormOutput = z.output<typeof forgetPasswordRequestSchema>;

interface ForgotPasswordFormProps {
  /** Called after a successful submit, with the entered email. */
  onSuccess?: (email: string) => void;
}

/**
 * Password-reset request form.
 *
 * Validation is driven by the shared `forgetPasswordRequestSchema` so the
 * client and API enforce one contract (only `email` is a form field;
 * `redirectTo` points at the web page that submits the new password).
 */
export function ForgotPasswordForm({ onSuccess }: ForgotPasswordFormProps) {
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

  const requestResetMutation = useMutation({
    mutationFn: async (values: ForgotPasswordFormOutput) => {
      // Enumeration-safe: the endpoint answers success whether or not the
      // email exists, so no error mapping beyond transport failures.
      const { error } = await authClient.requestPasswordReset({
        email: values.email,
        redirectTo: '/reset-password',
      });
      if (error) {
        throw new Error(error.message || GENERIC_REQUEST_ERROR);
      }
      return values.email;
    },
    onSuccess: (email) => onSuccess?.(email),
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          requestResetMutation.mutateAsync(values),
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

        {/* Transport/API error feedback */}
        <div aria-live="polite">
          {requestResetMutation.isError && (
            <p className="text-xs text-destructive">
              {requestResetMutation.error instanceof Error
                ? requestResetMutation.error.message
                : GENERIC_REQUEST_ERROR}
            </p>
          )}
        </div>

        <Button type="submit" disabled={requestResetMutation.isPending}>
          {requestResetMutation.isPending ? (
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
