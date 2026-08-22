import { Resend } from 'resend';
import { env } from '../../common/config/env.js';
import { logger } from '../../common/logger/index.js';

/**
 * Outgoing transactional auth email (single-use action link).
 *
 * Auth emails carry capability URLs (verification, reset, email change) —
 * the URL must never be logged in a configured environment.
 */
export interface AuthEmail {
  to: string;
  subject: string;
  /** The single-use action link (verification / reset / email-change). */
  actionUrl: string;
}

const resend = new Resend(env.RESEND_API_KEY);

/**
 * Auth email delivery (F1 Phase 2):
 * - Development/test: dev inbox mode — the action link is logged so the
 *   local flow can be completed without sending real mail.
 * - Production: sent via Resend (RESEND_API_KEY / EMAIL_FROM are required
 *   and validated at startup).
 */
export function sendAuthEmail(email: AuthEmail): Promise<void> {
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    logger.info(
      { to: email.to, subject: email.subject, actionUrl: email.actionUrl },
      'Auth email (dev inbox mode)',
    );
    return Promise.resolve();
  }

  const body = `Open this link to continue:\n${email.actionUrl}`;

  return resend.emails
    .send({
      from: env.EMAIL_FROM,
      to: email.to,
      subject: email.subject,
      text: body,
    })
    .then(({ data, error }) => {
      if (error) {
        logger.error({ err: error }, 'Failed to send auth email via Resend');
        return;
      }
      logger.info(
        { resendId: data?.id, to: email.to },
        'Auth email sent via Resend',
      );
    })
    .catch((error: unknown) => {
      logger.error({ err: error }, 'Failed to send auth email via Resend');
    });
}
