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

/**
 * Dev inbox mode (F1 Phase 1): auth emails are logged so the local flow can
 * be completed without an external mail provider. Phase 2 adds the Resend
 * adapter behind RESEND_API_KEY.
 */
export function sendAuthEmail(email: AuthEmail): Promise<void> {
  if (env.RESEND_API_KEY) {
    // Phase 2: Resend adapter goes here. Until it exists, fail loudly
    // instead of logging capability URLs in a configured environment.
    logger.error(
      { to: email.to, subject: email.subject },
      'RESEND_API_KEY set but Resend adapter not implemented yet — email not sent',
    );
  } else if (env.NODE_ENV === 'production') {
    logger.error(
      { to: email.to, subject: email.subject },
      'Auth email not sent: no RESEND_API_KEY configured (dev inbox mode is dev/test only)',
    );
  } else {
    logger.info(
      { to: email.to, subject: email.subject, actionUrl: email.actionUrl },
      'Auth email (dev inbox mode)',
    );
  }

  return Promise.resolve();
}
