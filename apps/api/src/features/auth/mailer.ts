import {
  renderEmail,
  type EmailTemplateName,
  type EmailTemplateProps,
} from '@shipyard/email';
import { Resend } from 'resend';
import { env } from '../../common/config/env.js';
import { logger } from '../../common/logger/index.js';

const resend = new Resend(env.RESEND_API_KEY);

/**
 * Auth email delivery (F1).
 *
 * Renders the requested template via @shipyard/email (subject + HTML +
 * plain text — one source of truth for every transactional email) and:
 * - development/test: dev inbox mode — the action link is logged so the
 *   local flow can be completed without sending real mail.
 * - production: sends via Resend (RESEND_API_KEY / EMAIL_FROM are required
 *   and validated at startup).
 *
 * Every template carries `actionUrl` (the single-use capability link) —
 * that's what dev inbox mode logs, and it must never be logged in prod.
 */
export function sendAuthEmail<T extends EmailTemplateName>(
  to: string,
  template: T,
  props: EmailTemplateProps[T],
): Promise<void> {
  return renderEmail(template, props)
    .then(({ subject, html, text }) => {
      const actionUrl = props.actionUrl;

      if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
        logger.info({ to, subject, actionUrl }, 'Auth email (dev inbox mode)');
        return;
      }

      if (env.EMAIL_ASSET_URL === undefined) {
        // The logo resolves to a relative URL without an asset base — the
        // email still sends (the link is the capability), but the header
        // image will be broken in clients.
        logger.warn(
          { to, subject },
          'EMAIL_ASSET_URL is not set — email logo will not load in production',
        );
      }

      return resend.emails
        .send({
          from: env.EMAIL_FROM,
          to,
          subject,
          html,
          text,
        })
        .then(({ data, error }) => {
          if (error) {
            logger.error(
              { err: error },
              'Failed to send auth email via Resend',
            );
            return;
          }
          logger.info(
            { resendId: data?.id, to, subject },
            'Auth email sent via Resend',
          );
        })
        .catch((error: unknown) => {
          logger.error({ err: error }, 'Failed to send auth email via Resend');
        });
    })
    .catch((error: unknown) => {
      logger.error({ err: error }, 'Failed to render auth email');
    });
}
