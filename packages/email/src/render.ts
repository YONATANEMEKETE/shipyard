import type { ReactElement } from 'react';
import { render } from '@react-email/render';
import {
  EmailChangeEmail,
  type EmailChangeEmailProps,
} from './templates/email-change.js';
import {
  InvitationEmail,
  type InvitationEmailProps,
} from './templates/invitation.js';
import {
  PasswordResetEmail,
  type PasswordResetEmailProps,
} from './templates/password-reset.js';
import {
  VerificationEmail,
  type VerificationEmailProps,
} from './templates/verification.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Template name → props contract (type-safe registry). */
export interface EmailTemplateProps {
  verification: VerificationEmailProps;
  passwordReset: PasswordResetEmailProps;
  emailChange: EmailChangeEmailProps;
  invitation: InvitationEmailProps;
}

export type EmailTemplateName = keyof EmailTemplateProps;

type EmailComponent<P> = ((props: P) => ReactElement) & {
  Subject: string | ((props: P) => string);
};

type Registry = {
  [N in EmailTemplateName]: {
    component: EmailComponent<EmailTemplateProps[N]>;
  };
};

const registry: Registry = {
  verification: { component: VerificationEmail },
  passwordReset: { component: PasswordResetEmail },
  emailChange: { component: EmailChangeEmail },
  invitation: { component: InvitationEmail },
};

/**
 * Render an email template to HTML + plain text with its subject line.
 * The API mailer is transport-agnostic: it receives { subject, html, text }
 * and sends (Resend) or logs (dev inbox).
 */
export async function renderEmail<N extends EmailTemplateName>(
  name: N,
  props: EmailTemplateProps[N],
): Promise<RenderedEmail> {
  const { component } = registry[name];
  const element = component(props);

  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);

  const subject =
    typeof component.Subject === 'function'
      ? component.Subject(props)
      : component.Subject;

  return { subject, html, text };
}
