'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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

type ResetPasswordFormInput = z.input<typeof resetPasswordRequestSchema>;
type ResetPasswordFormOutput = z.output<typeof resetPasswordRequestSchema>;

interface ResetPasswordFormProps {
  /** Reset token from the email link; merged into the payload on submit. */
  token?: string;
  onUpdated: () => void;
}

/**
 * New-password form.
 *
 * Validation is driven by the shared `resetPasswordRequestSchema` so the
 * client and API enforce one contract. Only `newPassword` is a form field —
 * the `token` comes from the URL query and is merged in by the integration
 * layer. Submission is intentionally not wired yet.
 */
export function ResetPasswordForm({ onUpdated }: ResetPasswordFormProps) {
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle');

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

  const onSubmit = async () => {
    // TODO: POST to the reset-password endpoint once integration lands,
    // merging the token from the URL query into the payload; surface
    // envelope errors here (e.g. details.auth === 'INVALID_TOKEN').
    setStatus('submitting');
    await new Promise((resolve) => setTimeout(resolve, 400));
    setStatus('idle');
    onUpdated();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
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

        {/* Slot for API error feedback once integration lands */}
        <div aria-live="polite" />

        <Button type="submit" disabled={status === 'submitting'}>
          {status === 'submitting' ? (
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
