'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { signUpRequestSchema, type SignUpRequest } from '@shipyard/shared';
import { Eye, EyeOff, Mail, MailCheck, User } from 'lucide-react';

import { AuthStagger, AuthStaggerItem } from '@/components/auth/auth-anim';
import { ResendVerificationButton } from '@/components/auth/resend-verification-button';
import { SocialButtons } from '@/components/auth/social-buttons';
import { FormError } from '@/components/ui/form-error';
import { authClient } from '@/lib/auth-client';
import { StatefulButton } from '@/components/motion/button/stateful';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

type SignUpFormValues = Pick<SignUpRequest, 'name' | 'email' | 'password'>;

const GENERIC_ERROR = 'Unable to create your account. Please try again.';

/**
 * Email + password sign-up flow.
 *
 * Validation runs against the shared `signUpRequestSchema` so the client
 * and API enforce one contract. On success the form swaps in place to the
 * "check your email" variant — with requireEmailVerification enabled and
 * autoSignIn disabled, no session exists until the user clicks the link.
 */
export function SignUpForm() {
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpRequestSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  });

  const signUpMutation = useMutation({
    mutationFn: async (values: SignUpFormValues) => {
      // With requireEmailVerification on and autoSignIn off, success here
      // returns the created user without a session.
      const { error } = await authClient.signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
      });
      if (error) {
        throw new Error(error.message || GENERIC_ERROR);
      }
      return values.email;
    },
    onSuccess: (email) => setSentEmail(email),
  });

  if (sentEmail !== null) {
    return (
      <AuthStagger className="flex flex-col items-center gap-6 text-center">
        <AuthStaggerItem>
          <div className="grid size-14 place-items-center rounded-full bg-accent text-accent-foreground">
            <MailCheck className="size-7" />
          </div>
        </AuthStaggerItem>

        <AuthStaggerItem>
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Check your email
            </h1>
            <p className="text-sm leading-[1.5] text-muted-foreground">
              We sent a verification link to{' '}
              <span className="font-medium text-foreground">{sentEmail}</span>.
              Go ahead and verify — then you can sign in.
            </p>
          </header>
        </AuthStaggerItem>

        <AuthStaggerItem>
          <div className="flex flex-col items-center gap-4">
            <ResendVerificationButton
              onResend={() =>
                authClient
                  .sendVerificationEmail({
                    email: sentEmail,
                    callbackURL: '/verify-email',
                  })
                  .then((r) => {
                    if (r.error) throw new Error(r.error.message);
                  })
              }
            />

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
        </AuthStaggerItem>
      </AuthStagger>
    );
  }

  return (
    <AuthStagger className="flex flex-col gap-8">
      <AuthStaggerItem>
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Create your account
          </h1>
          <p className="text-sm text-muted-foreground">
            Start planning, building, and shipping with your team.
          </p>
        </header>
      </AuthStaggerItem>

      <AuthStaggerItem>
        <AuthStagger className="flex flex-col gap-6">
          <AuthStaggerItem>
            <SocialButtons />
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
                onSubmit={form.handleSubmit((values) =>
                  signUpMutation.mutate(values),
                )}
                className="grid gap-4"
              >
                <AuthStagger className="grid gap-4">
                  <AuthStaggerItem>
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ada Lovelace"
                              autoComplete="name"
                              value={field.value}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                              error={fieldState.error?.message}
                              leftIcon={<User />}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </AuthStaggerItem>

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
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input
                              type={showPassword ? 'text' : 'password'}
                              placeholder="••••••••"
                              autoComplete="new-password"
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
                                    showPassword
                                      ? 'Hide password'
                                      : 'Show password'
                                  }
                                  className="pointer-events-auto"
                                >
                                  {showPassword ? <EyeOff /> : <Eye />}
                                </button>
                              }
                            />
                          </FormControl>
                          <FormDescription>
                            Must be between 8 and 128 characters.
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                  </AuthStaggerItem>

                  <AuthStaggerItem>
                    <FormError
                      message={
                        signUpMutation.isError
                          ? signUpMutation.error instanceof Error
                            ? signUpMutation.error.message
                            : GENERIC_ERROR
                          : null
                      }
                    />
                  </AuthStaggerItem>

                  <AuthStaggerItem>
                    <StatefulButton
                      type="submit"
                      state={signUpMutation.isPending ? 'loading' : 'idle'}
                      loadingText="Creating account…"
                      disabled={signUpMutation.isPending}
                      className="w-full"
                    >
                      Create account
                    </StatefulButton>
                  </AuthStaggerItem>
                </AuthStagger>
              </form>
            </Form>
          </AuthStaggerItem>

          <AuthStaggerItem>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link
                href="/sign-in"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </AuthStaggerItem>
        </AuthStagger>
      </AuthStaggerItem>
    </AuthStagger>
  );
}
