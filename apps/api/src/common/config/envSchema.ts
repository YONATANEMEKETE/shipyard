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
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(86400000)
    .default(300000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100000).default(30),
  API_URL: z.string().url().default('http://localhost:4000'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default('info'),
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid connection URL')
    .default('postgresql://shipyard:shipyard@localhost:5433/shipyard'),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters')
    .default('dev-secret-please-change-must-be-at-least-32-chars-long'),
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  RESEND_FROM: z.string().default('Shipyard <no-reply@yonatanem.com>'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  GITHUB_CLIENT_ID: z.string().min(1, 'GITHUB_CLIENT_ID is required'),
  GITHUB_CLIENT_SECRET: z.string().min(1, 'GITHUB_CLIENT_SECRET is required'),

  // R2 public asset storage (S3-compatible; settings F11, data-model §2.2).
  // `shipyard-bucket` is PUBLIC-READ by design — access control is unguessable
  // keys. Only non-secret objects (avatars/, future public prefixes) go in it;
  // private/confidential objects must use a separate private bucket.
  // Required at boot outside tests — integration tests inject an in-memory
  // fake adapter instead of touching real storage.
  R2_ENDPOINT: z.string().url('R2_ENDPOINT must be a valid URL'),
  R2_PUBLIC_BUCKET: z.string().min(1, 'R2_PUBLIC_BUCKET is required'),
  R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID is required'),
  R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY is required'),
  R2_PUBLIC_BASE_URL: z.string().url('R2_PUBLIC_BASE_URL must be a valid URL'),
});

export type Env = z.infer<typeof envSchema>;
