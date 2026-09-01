'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signInRequestSchema } from '@shipyard/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Eye, EyeOff, Mail } from 'lucide-react';

import { AuthStagger, AuthStaggerItem } from '@/components/auth/auth-anim';
import { StatefulButton } from '@/components/motion/button/stateful';
import { Checkbox } from '@/components/motion/checkbox';
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
import { authClient } from '@/lib/auth-client';
import { safeInternalPath, resumeHref } from '@/lib/auth/next-redirect';
import { FormError } from '@/components/ui/form-error';
import { SocialButtons } from '@/components/auth/social-buttons';

// The schema applies `.default()` to rememberMe, so its input type
// (rememberMe optional) differs from its output (required). RHF's third
// generic carries the post-validation transform.
type SignInFormInput = z.input<typeof signInRequestSchema>;
type SignInFormOutput = z.output<typeof signInRequestSchema>;

const GENERIC_SIGN_IN_ERROR = 'Unable to sign in. Please try again.';

/**
 * Email + password sign-in form.
 *
 * Validation is driven by the shared `signInRequestSchema` so the client
 * and API enforce one contract. Submission goes through Better Auth's
 * sign-in endpoint; the API answers with the shared error envelope, whose
 * message is surfaced inline.
 *
 * `next` is the resume path from the invitation flow — after a successful
 * login the user is bounced back there instead of the workspace dispatcher.
 */
export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<SignInFormInput, unknown, SignInFormOutput>({
    resolver: zodResolver(signInRequestSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: true,
    },
  });

  const signInMutation = useMutation({
    mutationFn: async (values: SignInFormOutput) => {
      const { error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
        rememberMe: values.rememberMe,
      });
      if (!error) return;

      // The API answers with the shared envelope; better-fetch spreads that
      // body onto the client error, so code/message/details live under
      // error.error.*. Map to user-friendly copy here.
      const envelope = (
        error as unknown as {
          status?: number;
          error?: { message?: string; details?: { auth?: string } };
        }
      ).error;
      const authCode = envelope?.details?.auth;

      if (authCode === 'EMAIL_NOT_VERIFIED') {
        throw new Error(
          'Please verify your email address before signing in — check your inbox.',
        );
      }
      if (error.status === 429) {
        throw new Error(
          'Too many attempts. Please wait a moment and try again.',
        );
      }
      if (error.status === 401 || error.status === 400) {
        throw new Error('Invalid email or password.');
      }
      throw new Error(envelope?.message ?? GENERIC_SIGN_IN_ERROR);
    },
    onSuccess: () => {
      router.replace(safeInternalPath(next) ?? '/w');
    },
  });

  return (
    <AuthStagger className="flex flex-col gap-6">
      <AuthStaggerItem>
        {/* OAuth round-trip lands on the resume path (invitation flow) or the
            workspace dispatcher when no invitation is pending. */}
        <SocialButtons callbackURL={safeInternalPath(next) ?? '/w'} />
      </AuthStaggerItem>

      <AuthStaggerItem>
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>
      </AuthStaggerItem>

      <AuthStaggerItem>
        <Form {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit((values) => {
              void signInMutation.mutateAsync(values).catch(() => {});
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
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field, fieldState }) => (
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
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          autoComplete="current-password"
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                          error={fieldState.error?.message}
                          rightIcon={
                            <button
                              type="button"
                              onClick={() => setShowPassword((s) => !s)}
                              aria-label={
                                showPassword ? 'Hide password' : 'Show password'
                              }
                              className="pointer-events-auto"
                            >
                              {showPassword ? <EyeOff /> : <Eye />}
                            </button>
                          }
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </AuthStaggerItem>

              <AuthStaggerItem>
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
              </AuthStaggerItem>

              <AuthStaggerItem>
                <FormError
                  message={
                    signInMutation.isError
                      ? signInMutation.error instanceof Error
                        ? signInMutation.error.message
                        : GENERIC_SIGN_IN_ERROR
                      : null
                  }
                />
              </AuthStaggerItem>

              <AuthStaggerItem>
                <StatefulButton
                  type="submit"
                  state={signInMutation.isPending ? 'loading' : 'idle'}
                  loadingText="Signing in…"
                  disabled={signInMutation.isPending}
                  className="w-full"
                >
                  Sign in
                </StatefulButton>
              </AuthStaggerItem>
            </AuthStagger>
          </form>
        </Form>
      </AuthStaggerItem>

      <AuthStaggerItem>
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link
            href={next ? resumeHref('/sign-up', next) : '/sign-up'}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </p>
      </AuthStaggerItem>
    </AuthStagger>
  );
}
