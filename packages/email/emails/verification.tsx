import {
  VerificationEmail,
  type VerificationEmailProps,
} from '../src/templates/verification.js';

const WithPreview = Object.assign(VerificationEmail, {
  PreviewProps: {
    userName: 'Ada Lovelace',
    actionUrl: 'https://shipyard.app/api/v1/auth/verify-email?token=demo-token',
  } satisfies VerificationEmailProps,
});

export default WithPreview;
