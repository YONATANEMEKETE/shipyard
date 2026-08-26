import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Auth response contracts
//
// Shared Zod schemas for the JSON responses Better Auth returns from each
// endpoint. The web app uses these to type API responses and optionally
// validate them at runtime. The API does not re-validate — Better Auth already
// shapes these.
//
// Note: some endpoints (verify-email) respond with an HTTP redirect rather
// than JSON when a callbackURL is provided. Those schemas only describe the
// JSON fallback (no callbackURL case).
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared model shapes ──

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

export const authSessionSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  userId: z.string(),
  expiresAt: z.string().datetime(),
  token: z.string(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
});

export type AuthSession = z.infer<typeof authSessionSchema>;

// ── POST /api/v1/auth/sign-up/email ──
// When autoSignIn is disabled (our config), token is null and no session is
// created until the email is verified. When autoSignIn is enabled, a session
// token is returned.

export const signUpResponseSchema = z.object({
  token: z.string().nullable(),
  user: authUserSchema,
});

export type SignUpResponse = z.infer<typeof signUpResponseSchema>;

// ── POST /api/v1/auth/sign-in/email ──

export const signInResponseSchema = z.object({
  redirect: z.boolean(),
  token: z.string(),
  url: z.string().nullable(),
  user: authUserSchema,
});

export type SignInResponse = z.infer<typeof signInResponseSchema>;

// ── POST /api/v1/auth/sign-out ──

export const signOutResponseSchema = z.object({
  success: z.literal(true),
  url: z.string().nullable().optional(),
  redirect: z.boolean().optional(),
});

export type SignOutResponse = z.infer<typeof signOutResponseSchema>;

// ── GET /api/v1/auth/get-session ──
// Returns null when there is no session cookie.

export const getSessionResponseSchema = z
  .object({
    session: authSessionSchema,
    user: authUserSchema,
  })
  .nullable();

export type GetSessionResponse = z.infer<typeof getSessionResponseSchema>;

// ── GET /api/v1/auth/verify-email ──
// Responds with a redirect when callbackURL is provided. The JSON fallback
// (no callbackURL) returns { status: true, user: null }.

export const verifyEmailResponseSchema = z.object({
  status: z.literal(true),
  user: z.null(),
});

export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;

// ── POST /api/v1/auth/send-verification-email ──

export const sendVerificationEmailResponseSchema = z.object({
  status: z.literal(true),
});

export type SendVerificationEmailResponse = z.infer<
  typeof sendVerificationEmailResponseSchema
>;

// ── POST /api/v1/auth/forget-password ──

export const forgetPasswordResponseSchema = z.object({
  status: z.literal(true),
  message: z.string(),
});

export type ForgetPasswordResponse = z.infer<
  typeof forgetPasswordResponseSchema
>;

// ── POST /api/v1/auth/reset-password ──

export const resetPasswordResponseSchema = z.object({
  status: z.literal(true),
});

export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;
