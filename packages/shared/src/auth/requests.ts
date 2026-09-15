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

// ── Canonical bounds ──

// Mirrors `emailAndPassword.minPasswordLength` / `maxPasswordLength` in
// apps/api/src/lib/auth.ts. Shared so every password surface — sign-up, reset
// and change — can never disagree about what the API will accept.

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

// ── POST /api/v1/auth/sign-up/email ──

export const signUpRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('A valid email is required'),
  password: passwordSchema,
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

// ── POST /api/v1/auth/change-email ──
//
// Better Auth-owned, and deliberately absent from the settings API: the
// profile schema is `.strict()`, so an `email` key is a 400 — identity writes
// belong to Auth. Shared so the client validates the new address with the
// same rule as sign-in.

export const changeEmailRequestSchema = z.object({
  newEmail: z.email('A valid email is required'),
  callbackURL: z.string().optional(),
});

export type ChangeEmailRequest = z.infer<typeof changeEmailRequestSchema>;

// ── POST /api/v1/auth/change-password ──
//
// Better Auth-owned too — the settings API exposes no password route. It takes
// no `confirmPassword`: confirmation is a UI concern and never leaves the
// browser. Better Auth's `revokeOtherSessions` is deliberately absent as well,
// because the card promises the user stays signed in on their current devices.

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: passwordSchema,
});

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

// ── POST /api/v1/auth/set-password ──
//
// The first password, for an account created through a linked provider. Better
// Auth's own `set-password` endpoint is `serverOnly` — verified against a
// running server, it answers 404 over HTTP while its neighbours answer 401 — so
// the API exposes it and this is the body that route accepts. No
// `currentPassword`: there is nothing to prove yet, and offering one would make
// it a back door around the change flow.

export const setPasswordRequestSchema = z.object({
  newPassword: passwordSchema,
});

export type SetPasswordRequest = z.infer<typeof setPasswordRequestSchema>;

// ── POST /api/v1/auth/forget-password ──

export const forgetPasswordRequestSchema = z.object({
  email: z.email('A valid email is required'),
  redirectTo: z.string().optional(),
});

export type ForgetPasswordRequest = z.infer<typeof forgetPasswordRequestSchema>;

// ── POST /api/v1/auth/reset-password ──

export const resetPasswordRequestSchema = z.object({
  newPassword: passwordSchema,
  token: z.string().optional(),
});

export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
