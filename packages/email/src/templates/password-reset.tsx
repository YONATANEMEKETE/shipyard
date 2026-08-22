import { EmailDivider, EmailLayout } from '../layout.js';
import { Section, Text } from '@react-email/components';

export interface PasswordResetEmailProps {
  /** The email the reset was requested for. */
  email: string;
  /** The single-use reset link. */
  actionUrl: string;
}

const SUBJECT = 'Reset your Shipyard password';

/**
 * Sent on request-password-reset. The reset link is single-use and expires
 * after 1 hour (Better Auth default).
 */
export function PasswordResetEmail({
  email,
  actionUrl,
}: PasswordResetEmailProps) {
  return (
    <EmailLayout
      preview="Reset your Shipyard password"
      cta={{ label: 'Reset password', href: actionUrl }}
    >
      <Text className="m-0 text-[24px] font-semibold text-[#171717]">
        Reset your password
      </Text>
      <Text className="mt-2 text-[15px] leading-relaxed text-[#171717]">
        We received a request to reset the password for{' '}
        <span className="font-medium">{email}</span>. Click below to choose a
        new one.
      </Text>

      <EmailDivider />

      <Section>
        <Text className="m-0 text-[13px] leading-relaxed text-[#6c6861]">
          This link expires in 1 hour and can be used once. If you didn&apos;t
          request a password reset, you can safely ignore this email — your
          password stays unchanged.
        </Text>
      </Section>
    </EmailLayout>
  );
}

PasswordResetEmail.Subject = SUBJECT;
