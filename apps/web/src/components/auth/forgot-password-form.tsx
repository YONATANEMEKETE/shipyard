'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { forgetPasswordRequestSchema } from '@shipyard/shared';
import { Mail } from 'lucide-react';
import { z } from 'zod';

import { authClient } from '@/lib/auth-client';

import { AuthStagger, AuthStaggerItem } from '@/components/auth/auth-anim';
import { StatefulButton } from '@/components/motion/button/stateful';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
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
        noValidate
        onSubmit={form.handleSubmit((values) => {
          void requestResetMutation.mutateAsync(values).catch(() => {});
        })}
        className="grid gap-4"
      >
        <AuthStagger className="grid gap-4">
          <AuthStaggerItem>
            <FormField
              control={form.control}
              name="email"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@company.com"
                      autoComplete="email"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                      error={fieldState.error?.message}
                      leftIcon={<Mail />}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </AuthStaggerItem>

          <AuthStaggerItem>
            <div aria-live="polite">
              {requestResetMutation.isError && (
                <p className="text-xs text-destructive">
                  {requestResetMutation.error instanceof Error
                    ? requestResetMutation.error.message
                    : GENERIC_REQUEST_ERROR}
                </p>
              )}
            </div>
          </AuthStaggerItem>

          <AuthStaggerItem>
            <StatefulButton
              type="submit"
              state={requestResetMutation.isPending ? 'loading' : 'idle'}
              loadingText="Sending reset link…"
              disabled={requestResetMutation.isPending}
              className="w-full"
            >
              Send reset link
            </StatefulButton>
          </AuthStaggerItem>

          <AuthStaggerItem>
            <p className="text-center text-sm text-muted-foreground">
              Remembered it?{' '}
              <Link
                href="/sign-in"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </AuthStaggerItem>
        </AuthStagger>
      </form>
    </Form>
  );
}
