import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { env } from '../../common/config/env.js';
import { prisma } from '../../common/db/client.js';
import { sendAuthEmail } from './mailer.js';

type SocialProviders = NonNullable<BetterAuthOptions['socialProviders']>;

/**
 * OAuth providers activate only when their credentials are present. F1
 * Phase 2 wires Google + GitHub; until the client IDs/secrets land, the app
 * boots with email/password only.
 */
function buildSocialProviders(): SocialProviders {
  const providers: SocialProviders = {};

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    providers.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    };
  }

  return providers;
}

/**
 * The Shipyard Better Auth instance (ADR-001).
 *
 * - Mounted at `/api/v1/auth/*splat` on the Express app (F1 Phase 2).
 * - Sessions are DB-backed, token-hashed-at-rest, HttpOnly cookie transport.
 * - baseURL is the WEB origin because the browser reaches the API through
 *   the Next.js proxy (ADR-003): OAuth callbacks and email links must point
 *   at the public surface, never the internal API port.
 *
 * Spec: shipyard-design/04-Engineering/features/auth/ (domain · data · api).
 */
export const auth = betterAuth({
  baseURL: env.WEB_URL,
  basePath: '/api/v1/auth',
  trustedOrigins: [env.WEB_URL, env.API_URL],

  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Unverified users cannot sign in → 403, the web app shows the
    // verification-pending screen with a rate-limited resend.
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: 'Reset your Shipyard password',
        actionUrl: url,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24, // 24h tokens
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: 'Verify your Shipyard email',
        actionUrl: url,
      });
    },
  },

  user: {
    changeEmail: {
      enabled: true,
    },
    additionalFields: {
      // Shipyard addition (PRD §5.11): light | dark | system, account-level.
      theme: {
        type: 'string',
        defaultValue: 'system',
        input: false, // edited in settings (F11), never at registration
      },
    },
  },

  session: {
    // Fixed expiry (F1 decision): 7 days normal, 30 days remember-me —
    // no rolling extension in the MVP.
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 0,
  },

  socialProviders: buildSocialProviders(),
});
