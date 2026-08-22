export {
  renderEmail,
  type EmailTemplateName,
  type EmailTemplateProps,
  type RenderedEmail,
} from './render.js';
export {
  EmailLayout,
  EmailDivider,
  FallbackLink,
  type EmailLayoutProps,
} from './layout.js';
export { colors, assetBaseURL } from './theme.js';
// Template components — reusable directly (e.g. the react-email preview, or
// sending `react` elements through Resend without the registry).
export {
  VerificationEmail,
  type VerificationEmailProps,
} from './templates/verification.js';
export {
  PasswordResetEmail,
  type PasswordResetEmailProps,
} from './templates/password-reset.js';
export {
  EmailChangeEmail,
  type EmailChangeEmailProps,
} from './templates/email-change.js';
export {
  InvitationEmail,
  invitationSubject,
  type InvitationEmailProps,
} from './templates/invitation.js';
