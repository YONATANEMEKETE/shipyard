'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { resetPasswordRequestSchema } from '@shipyard/shared';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';

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
import { authClient } from '@/lib/auth-client';

const GENERIC_RESET_ERROR = 'Unable to update your password. Please try again.';

type ResetPasswordFormInput = z.input<typeof resetPasswordRequestSchema>;
type ResetPasswordFormOutput = z.output<typeof resetPasswordRequestSchema>;

interface ResetPasswordFormProps {
  /** Reset token from the email link; submitted with the new password. */
  token: string;
  onUpdated: () => void;
  /** The API rejected the token (invalid or expired). */
  onInvalidToken: () => void;
}

/**
 * New-password form.
 *
 * Validation is driven by the shared `resetPasswordRequestSchema` so the
 * client and API enforce one contract. Only `newPassword` is a form field —
 * the `token` comes from the URL query and is merged in by the integration
 * layer.
 */
export function ResetPasswordForm({
  token,
  onUpdated,
  onInvalidToken,
}: ResetPasswordFormProps) {
  const form = useForm<
    ResetPasswordFormInput,
    unknown,
    ResetPasswordFormOutput
  >({
    resolver: zodResolver(resetPasswordRequestSchema),
    defaultValues: {
      newPassword: '',
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (values: ResetPasswordFormOutput) => {
      const { error } = await authClient.resetPassword({
        newPassword: values.newPassword,
        token,
      });
      if (!error) return 'updated' as const;

      // Expired/used/unknown tokens land here as UNAUTHORIZED with the
      // envelope's auth detail; treat any 4xx token rejection uniformly.
      const authCode = (
        error as unknown as { error?: { details?: { auth?: string } } }
      ).error?.details?.auth;
      if (
        error.status === 401 ||
        authCode === 'INVALID_TOKEN' ||
        authCode === 'TOKEN_EXPIRED'
      ) {
        return 'invalid-token' as const;
      }

      throw new Error(GENERIC_RESET_ERROR);
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    void resetMutation
      .mutateAsync(values)
      .then((result) => {
        if (result === 'invalid-token') {
          onInvalidToken();
          return;
        }
        onUpdated();
      })
      .catch(() => {});
  });

  return (
    <Form {...form}>
      <form noValidate onSubmit={onSubmit} className="grid gap-4">
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
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

        {/* Transport/API error feedback */}
        <div aria-live="polite">
          {resetMutation.isError && (
            <p className="text-xs text-destructive">
              {resetMutation.error instanceof Error
                ? resetMutation.error.message
                : GENERIC_RESET_ERROR}
            </p>
          )}
        </div>

        <Button type="submit" disabled={resetMutation.isPending}>
          {resetMutation.isPending ? (
            <>
              <Loader2 className="animate-spin" />
              Updating password…
            </>
          ) : (
            'Reset password'
          )}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Remembered it after all?{' '}
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
