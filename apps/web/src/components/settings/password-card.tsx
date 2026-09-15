'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, KeyRound, Lock } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { changePasswordRequestSchema, passwordSchema } from '@shipyard/shared';

import { StatefulButton } from '@/components/motion/button/stateful';
import { useToast } from '@/components/providers/toast-provider';
import {
  CONTROL_CLASS,
  FIELD_CLASS_NAMES,
} from '@/components/settings/field-styles';
import { SettingsCard } from '@/components/settings/settings-card';
import { Form, FormField } from '@/components/ui/form';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { accountKeys, useLinkedAccounts } from '@/hooks/use-linked-accounts';
import { setPassword } from '@/lib/api/auth-account';
import { authClient } from '@/lib/auth-client';

/**
 * Security card — the password section (`.pen` `Xwmto` → `M5ZZX`).
 *
 * Geometry mirrors the frame: 1128×332 at 1440 wide, every child 18px apart in
 * a 24px-padded card, which reconciles exactly —
 *   24 + 14 + 18 + 18 + 18 + 16 + 18 + 55 + 18 + 55 + 18 + 36 + 24 = 332
 * (pad, eyebrow, gap, heading, gap, copy, gap, current field, gap, the two-up
 * row, gap, button, pad). The new/confirm pair is a deliberate 16px row of two
 * equal fields, not a stacked form.
 *
 * Two modes, and the same read decides the copy, the fields and the endpoint:
 *
 *   credential row exists → Current + New + Confirm → `authClient.changePassword`
 *   none                  → New + Confirm           → `POST /api/v1/auth/set-password`
 *
 * Nothing navigates away. Better Auth's `setPassword` is `serverOnly`, so the
 * API exposes it (see `lib/api/auth-account.ts`) — an account created through
 * Google cannot be handed to a reset-email flow while it is already signed in.
 */

/**
 * Mode-dependent rules built on the shared contracts, so the client rejects
 * exactly what the server would and no message is re-typed. The current
 * password only becomes required once one exists to check.
 */
function makeFormSchema(requireCurrentPassword: boolean) {
  return z
    .object({
      currentPassword: requireCurrentPassword
        ? changePasswordRequestSchema.shape.currentPassword
        : z.string(),
      newPassword: passwordSchema,
      confirmPassword: z.string().min(1, 'Repeat the new password'),
    })
    .refine((values) => values.newPassword === values.confirmPassword, {
      path: ['confirmPassword'],
      message: 'Passwords do not match',
    });
}

type PasswordFormValues = z.infer<ReturnType<typeof makeFormSchema>>;

/** `google` → `Google`, so the copy can name the provider the user actually uses. */
function providerLabel(providerId: string): string {
  if (providerId === 'github') return 'GitHub';
  if (providerId === 'google') return 'Google';
  return 'a linked provider';
}

/**
 * Reads the failure out of either error shape.
 *
 * The better-auth client nests the API envelope under `error` (better-fetch
 * spreads the parsed body), while our own client's `ApiError` carries the
 * envelope fields flat. Both park the original Better Auth code in
 * `details.auth` — that is what makes `PASSWORD_ALREADY_SET` distinguishable
 * from a plain 409.
 */
function readFailure(error: unknown): {
  code?: string;
  authCode?: string;
  message?: string;
} {
  const flat = error as
    | { code?: string; message?: string; details?: { auth?: string } }
    | undefined;
  const nested = (
    error as
      | {
          error?: {
            code?: string;
            message?: string;
            details?: { auth?: string };
          };
        }
      | undefined
  )?.error;

  const source = nested ?? flat;

  return {
    code: source?.code,
    authCode: source?.details?.auth,
    message: source?.message,
  };
}

export function PasswordCard() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const accountsQuery = useLinkedAccounts();

  // Unknown reads as "has a password": that is the common case, and the
  // CREDENTIAL_ACCOUNT_NOT_FOUND mapping below still catches the other one if
  // this read failed or raced a password being created.
  const accounts = accountsQuery.data;
  const hasPassword =
    accounts?.some((account) => account.providerId === 'credential') ?? true;

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(makeFormSchema(hasPassword)),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const linkedProvider = providerLabel(
    accounts?.find((account) => account.providerId !== 'credential')
      ?.providerId ?? '',
  );

  /**
   * Field-level mapping shared by both endpoints: a drift guard for the two
   * rules the shared schema already enforces, since reaching either means the
   * client and server bounds disagree.
   */
  const applySharedRuleFailure = (authCode: string | undefined): boolean => {
    if (authCode === 'PASSWORD_TOO_SHORT') {
      form.setError('newPassword', {
        message: 'Password must be at least 8 characters',
      });
      return true;
    }
    if (authCode === 'PASSWORD_TOO_LONG') {
      form.setError('newPassword', {
        message: 'Password must be at most 128 characters',
      });
      return true;
    }
    return false;
  };

  const flipToChangeMode = () => {
    void queryClient.invalidateQueries({ queryKey: accountKeys.all });
    setFormError(
      'A password already exists for this account. Enter it to change your password.',
    );
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    // ── First password ──
    if (!hasPassword) {
      try {
        await setPassword({ newPassword: values.newPassword });
      } catch (error) {
        const { code, authCode, message } = readFailure(error);

        // Someone set one in another tab between the read and the submit.
        if (authCode === 'PASSWORD_ALREADY_SET' || code === 'CONFLICT') {
          flipToChangeMode();
          return;
        }
        if (applySharedRuleFailure(authCode)) return;

        setFormError(message ?? 'We could not set your password. Try again.');
        return;
      }

      showToast({
        status: 'success',
        title: 'Password set',
        description: 'You can now sign in with your email as well.',
      });
      form.reset();
      // Flips the card to change mode once the read comes back.
      void queryClient.invalidateQueries({ queryKey: accountKeys.all });
      return;
    }

    // ── Change ──
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      // Changing a password ends every other session. Better Auth deletes them
      // all and re-issues one for this browser, so the user stays put while
      // anything else that was signed in is forced out.
      revokeOtherSessions: true,
    });

    if (error) {
      const { authCode, message } = readFailure(error);

      // A wrong current password is a field problem, not a page problem.
      if (authCode === 'INVALID_PASSWORD') {
        form.setError('currentPassword', {
          message: 'That is not your current password.',
        });
        return;
      }

      // The credential row disappeared between the read and the submit.
      if (authCode === 'CREDENTIAL_ACCOUNT_NOT_FOUND') {
        void queryClient.invalidateQueries({ queryKey: accountKeys.all });
        setFormError(
          'This account no longer has a password to change. Reload the page to set one.',
        );
        return;
      }

      if (applySharedRuleFailure(authCode)) return;

      setFormError(message ?? 'We could not update your password. Try again.');
      return;
    }

    showToast({
      status: 'success',
      title: 'Password updated',
      description: 'Every other device has been signed out.',
    });
    // Clearing the fields is the in-place confirmation; nothing cached holds a
    // password, so there is no query to invalidate.
    form.reset();
  });

  const clearServerError = () => {
    if (formError) setFormError(null);
  };

  return (
    <SettingsCard eyebrow="Security" title="Password">
      <p className="text-[13px] leading-[1.5] text-muted-foreground">
        {hasPassword
          ? 'Update your password regularly to keep your account secure. Changing it signs you out on your other devices.'
          : `This account signs in with ${linkedProvider}, so it has no password yet. Set one to sign in with your email as well — signing in with ${linkedProvider} keeps working.`}
      </p>

      <Form {...form}>
        <form
          noValidate
          onSubmit={onSubmit}
          className="flex w-full flex-col gap-[18px]"
        >
          {/* Only a password that exists can be confirmed, so the field only
              exists in change mode. */}
          {hasPassword ? (
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field, fieldState }) => (
                <Input
                  label="Current password"
                  type="password"
                  value={field.value}
                  onChange={(value) => {
                    clearServerError();
                    field.onChange(value, {
                      shouldValidate: form.formState.isSubmitted,
                    });
                  }}
                  onBlur={() => {
                    field.onBlur();
                    form.trigger('currentPassword');
                  }}
                  error={fieldState.error?.message}
                  leftIcon={<Lock className="size-[15px]" />}
                  classNames={FIELD_CLASS_NAMES}
                />
              )}
            />
          ) : null}

          {/* Two equal fields on one row, per the frame — stacking them below
              the small breakpoint keeps the pair readable on a phone. */}
          <div className="flex w-full flex-col gap-4 sm:flex-row">
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field, fieldState }) => (
                <Input
                  label="New password"
                  type="password"
                  placeholder="Enter a new password"
                  value={field.value}
                  onChange={(value) => {
                    clearServerError();
                    field.onChange(value, {
                      shouldValidate: form.formState.isSubmitted,
                    });
                  }}
                  onBlur={() => {
                    field.onBlur();
                    form.trigger('newPassword');
                  }}
                  error={fieldState.error?.message}
                  className="min-w-0 flex-1"
                  leftIcon={<KeyRound className="size-[15px]" />}
                  classNames={FIELD_CLASS_NAMES}
                />
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field, fieldState }) => (
                <Input
                  label="Confirm new password"
                  type="password"
                  placeholder="Repeat the new password"
                  value={field.value}
                  onChange={(value) => {
                    clearServerError();
                    field.onChange(value, {
                      shouldValidate: form.formState.isSubmitted,
                    });
                  }}
                  onBlur={() => {
                    field.onBlur();
                    form.trigger('confirmPassword');
                  }}
                  error={fieldState.error?.message}
                  className="min-w-0 flex-1"
                  leftIcon={<KeyRound className="size-[15px]" />}
                  classNames={FIELD_CLASS_NAMES}
                />
              )}
            />
          </div>

          {/* items-start, not the column default: a `flex-col` stretches its
              children, which would blow the button out to the card's full
              width instead of its own. */}
          <div className="flex w-full flex-col items-start gap-2">
            <FormError message={formError} />
            <StatefulButton
              type="submit"
              disabled={!form.formState.isDirty || form.formState.isSubmitting}
              state={form.formState.isSubmitting ? 'loading' : 'idle'}
              loadingText={hasPassword ? 'Updating…' : 'Setting…'}
              icon={<Check className="size-[15px]" />}
              className={`${CONTROL_CLASS} bg-ds-brand text-white hover:bg-ds-brand/90`}
            >
              {hasPassword ? 'Update password' : 'Set password'}
            </StatefulButton>
          </div>
        </form>
      </Form>
    </SettingsCard>
  );
}
