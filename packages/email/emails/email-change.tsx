import {
  EmailChangeEmail,
  type EmailChangeEmailProps,
} from '../src/templates/email-change.js';

const WithPreview = Object.assign(EmailChangeEmail, {
  PreviewProps: {
    userName: 'Ada Lovelace',
    newEmail: 'ada-new@example.com',
    actionUrl: 'https://shipyard.app/api/v1/auth/change-email?token=demo-token',
  } satisfies EmailChangeEmailProps,
});

export default WithPreview;
