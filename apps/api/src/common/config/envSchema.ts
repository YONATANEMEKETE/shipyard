import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  SHUTDOWN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120000)
    .default(30000),
  API_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(86400000)
    .default(60000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100000).default(120),
  // Base auth cap — per-endpoint auth policies (04-api-design.md §5) are
  // tighter; this is only a runaway safety net, so it stays generous.
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(86400000)
    .default(300000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100000).default(120),
  API_URL: z.string().url(),
  WEB_URL: z.string().url(),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default('info'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  // OAuth (F1 Phase 2) — required: fail fast at startup so a deployment
  // can never silently boot without auth providers configured.
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  // Email delivery — required for the same reason.
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  // Public base URL for email static assets (logo). Optional: dev/test don't
  // send real mail; production emails warn and send with a broken logo
  // until it is set.
  EMAIL_ASSET_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;
