import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import {
  renderEmailVerificationEmail,
  renderPasswordResetEmail,
} from '@shipyard/email';
import { env } from '../common/config/env.js';
import { prisma } from '../common/db/client.js';
import { logger } from '../common/logger/index.js';
import { sendEmail } from './mailer.js';

const socialProviders = {
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  },
  github: {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
  },
} as const;

export const auth = betterAuth({
  appName: 'Shipyard',
  // API is internal-only when deployed; all requests proxy through the Next.js app
  baseURL: env.WEB_URL,
  basePath: '/api/v1/auth',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_URL],

  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => {
      // v1.7 link shape: {webOrigin}/api/v1/auth/reset-password/{token}
      // ?callbackURL=… — an API endpoint that validates the token and then
      // redirects to the callback URL with a fresh ?token= for the
      // reset-password page. It flows through the Next.js rewrite; no
      // rewriting needed here.
      const { html, text } = await renderPasswordResetEmail({
        url,
        userEmail: user.email,
      });
      // mailer logs locally in dev and never throws, so auth flow is never
      // blocked by email delivery problems
      await sendEmail({
        to: user.email,
        subject: 'Reset your Shipyard password',
        html,
        text,
      });
    },
    resetPasswordTokenExpiresIn: 60 * 60, // 1h
    onPasswordReset: ({ user }) => {
      logger.info(
        { userId: user.id, email: user.email },
        'Password reset completed',
      );
      return Promise.resolve();
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: false,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60, // 1h
    sendVerificationEmail: async ({ user, url }) => {
      // The generated url targets the API's verify-email endpoint; rewrite
      // it to the web page that owns the post-click experience. The page
      // reads ?token= and performs the verification client-side.
      const verifyUrl = new URL(url);
      verifyUrl.pathname = '/verify-email';
      const { html, text } = await renderEmailVerificationEmail({
        url: verifyUrl.toString(),
        userEmail: user.email,
      });
      // mailer logs locally in dev and never throws, so auth flow is never
      // blocked by email delivery problems
      await sendEmail({
        to: user.email,
        subject: 'Verify your Shipyard email',
        html,
        text,
      });
    },
    afterEmailVerification: (user) => {
      logger.info({ userId: user.id, email: user.email }, 'Email verified');
      return Promise.resolve();
    },
  },

  socialProviders,

  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google', 'github'],
    },
  },

  user: {
    changeEmail: {
      enabled: true,
      // sendChangeEmailConfirmation could be added later for double-confirm flow
    },
    deleteUser: {
      enabled: false,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day sliding
    cookieCache: {
      enabled: false,
    },
  },

  advanced: {
    useSecureCookies: env.NODE_ENV === 'production',
    database: {
      // Let Better Auth generate base62 IDs (default). Never "serial"/"uuid" for MVP.
      generateId: undefined,
      // Joins require relations in Prisma schema — will be present after `generate`
      // Keep false until migration lands to avoid query errors during bootstrap
      joins: false,
    },
  },

  rateLimit: {
    enabled: env.NODE_ENV === 'production',
    storage: 'memory',
    window: 60,
    max: 100,
    // Per-route custom limits are enforced by Express rate-limit middleware in app.ts
    // (authRateLimiter) — keep Better Auth defaults here for defense in depth.
  },

  logger: {
    disabled: env.LOG_LEVEL === 'silent',
    level:
      env.LOG_LEVEL === 'trace'
        ? 'debug'
        : env.LOG_LEVEL === 'fatal'
          ? 'error'
          : env.LOG_LEVEL === 'silent'
            ? 'error'
            : env.LOG_LEVEL,
  },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
