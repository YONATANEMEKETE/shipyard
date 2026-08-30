import type { ReactElement } from 'react';
import { render, toPlainText } from 'react-email';
import {
  EmailVerificationEmail,
  type EmailVerificationEmailProps,
} from './templates/email-verification.js';
import {
  PasswordResetEmail,
  type PasswordResetEmailProps,
} from './templates/password-reset.js';
import {
  WorkspaceInvitationEmail,
  type WorkspaceInvitationEmailProps,
} from './templates/workspace-invitation.js';

export * from './templates/email-verification.js';
export * from './templates/password-reset.js';
export * from './templates/workspace-invitation.js';

export interface EmailRenderResult {
  html: string;
  text: string;
}

async function renderEmail(template: ReactElement): Promise<EmailRenderResult> {
  const html = await render(template);
  return { html, text: toPlainText(html) };
}

export async function renderPasswordResetEmail(
  props: PasswordResetEmailProps,
): Promise<EmailRenderResult> {
  return renderEmail(<PasswordResetEmail {...props} />);
}

export async function renderEmailVerificationEmail(
  props: EmailVerificationEmailProps,
): Promise<EmailRenderResult> {
  return renderEmail(<EmailVerificationEmail {...props} />);
}

export async function renderWorkspaceInvitationEmail(
  props: WorkspaceInvitationEmailProps,
): Promise<EmailRenderResult> {
  return renderEmail(<WorkspaceInvitationEmail {...props} />);
}
