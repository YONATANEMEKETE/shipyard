import { Resend } from 'resend';
import { env } from '../common/config/env.js';
import { logger } from '../common/logger/index.js';

/**
 * A message ready to be delivered — the recipient, subject and the rendered
 * email body. Rendering lives outside the mailer (see @shipyard/email).
 */
export interface EmailMessage {
  to: string;
  subject: string;
  /** Rendered HTML body. */
  html: string;
  /** Optional plain-text alternative; Resend derives one from html when omitted. */
  text?: string;
}

export type SendEmailResult =
  | { status: 'sent'; id: string | undefined }
  | { status: 'logged' }
  | { status: 'failed'; error: unknown };

const resend = new Resend(env.RESEND_API_KEY);

/**
 * Send a transactional email through Resend.
 *
 * Outside production the email is never sent: it is logged in full so
 * flows can be exercised and reviewed locally. In production the message
 * goes through the Resend API; delivery failures are logged and surfaced
 * in the result instead of thrown, so auth flows never fail on email.
 */
export async function sendEmail(
  message: EmailMessage,
): Promise<SendEmailResult> {
  const { to, subject, html, text } = message;

  // Only the test environment logs; dev and prod deliver through Resend so
  // flows are exercised against the real provider locally.
  if (env.NODE_ENV === 'test') {
    logger.info(
      { to, subject, html, text },
      '[mailer] NODE_ENV is not production — email logged instead of sent',
    );
    return { status: 'logged' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
    });

    if (error) {
      logger.error(
        { err: error, to, subject },
        '[mailer] Resend rejected the email',
      );
      return { status: 'failed', error };
    }

    logger.info(
      { to, subject, id: data?.id },
      '[mailer] Email sent via Resend',
    );
    return { status: 'sent', id: data?.id };
  } catch (error) {
    logger.error(
      { err: error, to, subject },
      '[mailer] Unexpected error sending email via Resend',
    );
    return { status: 'failed', error };
  }
}
