import { z } from 'zod';

/**
 * Auth contracts (F1).
 * Single source of truth for the auth DTOs crossing the API boundary —
 * consumed by the web app and OpenAPI generation. Better Auth's own types
 * are mapped to these at the module boundary (per 04-api-design.md §8).
 *
 * Timestamps are serialized as ISO-8601 strings (as Better Auth returns).
 */

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  image: z.string().nullable().optional(),
  // Shipyard addition: light | dark | system (PRD §5.11).
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

export const authSessionSchema = z.object({
  id: z.string(),
  token: z.string(),
  userId: z.string(),
  expiresAt: z.string(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AuthSession = z.infer<typeof authSessionSchema>;

/** GET /auth/get-session response (the app-shell backbone). */
export const getSessionResponseSchema = z.object({
  session: authSessionSchema.nullable(),
  user: authUserSchema.nullable(),
});

export type GetSessionResponse = z.infer<typeof getSessionResponseSchema>;

/**
 * Auth error codes (04-api-design.md §6). These are emitted inside the
 * global error envelope: { error: { code: AUTH_*, message, details } }.
 */
export const AUTH_ERROR_CODES = {
  INVALID_INPUT: 'AUTH_INVALID_INPUT',
  EMAIL_IN_USE: 'AUTH_EMAIL_IN_USE',
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED: 'AUTH_EMAIL_NOT_VERIFIED',
  UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  RATE_LIMITED: 'AUTH_RATE_LIMITED',
  OAUTH_FAILED: 'AUTH_OAUTH_FAILED',
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];
