import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Auth request contracts
//
// Shared Zod schemas for every Better Auth endpoint the Shipyard API exposes.
// Both the web app (client-side validation) and the API (server-side validation)
// import these so the contract stays in sync.
//
// Password constraints mirror the Better Auth config in apps/api/src/lib/auth.ts
// (minPasswordLength: 8, maxPasswordLength: 128).
// ─────────────────────────────────────────────────────────────────────────────

// ── POST /api/v1/auth/sign-up/email ──

export const signUpRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('A valid email is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  image: z.string().url().optional(),
  callbackURL: z.string().optional(),
  rememberMe: z.boolean().optional(),
});

export type SignUpRequest = z.infer<typeof signUpRequestSchema>;

// ── POST /api/v1/auth/sign-in/email ──

export const signInRequestSchema = z.object({
  email: z.email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
  callbackURL: z.string().optional(),
  rememberMe: z.boolean().default(true),
});

export type SignInRequest = z.infer<typeof signInRequestSchema>;

// ── POST /api/v1/auth/sign-out ──
// Body is optional — the session is read from the cookie.

export const signOutRequestSchema = z
  .object({
    callbackURL: z.string().optional(),
    disableRedirect: z.boolean().optional(),
  })
  .optional();

export type SignOutRequest = z.infer<typeof signOutRequestSchema>;

// ── GET /api/v1/auth/get-session ──
// No request body — the session is read from the cookie.
// Exported as an empty schema for contract completeness.

export const getSessionRequestSchema = z.object({}).optional();

export type GetSessionRequest = z.infer<typeof getSessionRequestSchema>;

// ── GET /api/v1/auth/verify-email ──
// Query parameters, not a request body.

export const verifyEmailRequestSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  callbackURL: z.string().optional(),
});

export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

// ── POST /api/v1/auth/send-verification-email ──

export const sendVerificationEmailRequestSchema = z.object({
  email: z.email('A valid email is required'),
  callbackURL: z.string().optional(),
});

export type SendVerificationEmailRequest = z.infer<
  typeof sendVerificationEmailRequestSchema
>;

// ── POST /api/v1/auth/forget-password ──

export const forgetPasswordRequestSchema = z.object({
  email: z.email('A valid email is required'),
  redirectTo: z.string().optional(),
});

export type ForgetPasswordRequest = z.infer<typeof forgetPasswordRequestSchema>;

// ── POST /api/v1/auth/reset-password ──

export const resetPasswordRequestSchema = z.object({
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  token: z.string().optional(),
});

export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
