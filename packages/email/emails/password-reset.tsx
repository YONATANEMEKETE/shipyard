import {
  PasswordResetEmail,
  type PasswordResetEmailProps,
} from '../src/templates/password-reset.js';

const WithPreview = Object.assign(PasswordResetEmail, {
  PreviewProps: {
    email: 'ada@example.com',
    actionUrl:
      'https://shipyard.app/api/v1/auth/reset-password?token=demo-token',
  } satisfies PasswordResetEmailProps,
});

export default WithPreview;
