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
 * be completed by clicking the logged link. The Resend adapter (Phase 2)
 * replaces this for all environments.
 */
export function sendAuthEmail(email: AuthEmail): Promise<void> {
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    logger.info(
      { to: email.to, subject: email.subject, actionUrl: email.actionUrl },
      'Auth email (dev inbox mode)',
    );
  } else {
    // TODO(F1 Phase 2): Resend adapter (RESEND_API_KEY / EMAIL_FROM are
    // already validated at startup).
    logger.error(
      { to: email.to, subject: email.subject },
      'Auth email not sent: Resend adapter not implemented yet (F1 Phase 2)',
    );
  }

  return Promise.resolve();
}
