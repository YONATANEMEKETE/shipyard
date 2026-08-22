import { EmailDivider, EmailLayout } from '../layout.js';
import { Section, Text } from '@react-email/components';

export interface VerificationEmailProps {
  /** Sender display name (from registration) — optional, falls back generic. */
  userName?: string;
  /** The single-use verification link (24h). */
  actionUrl: string;
}

const SUBJECT = 'Verify your Shipyard email';

/**
 * Sent on sign-up (sendOnSignUp). One CTA; expiry text mirrors the 24h
 * token lifetime configured in the API (emailVerification.expiresIn).
 */
export function VerificationEmail({
  userName,
  actionUrl,
}: VerificationEmailProps) {
  return (
    <EmailLayout
      preview="Confirm your email to activate your Shipyard account"
      cta={{ label: 'Verify email', href: actionUrl }}
    >
      <Text className="m-0 text-[24px] font-semibold text-[#171717]">
        Verify your email
      </Text>
      <Text className="mt-2 text-[15px] leading-relaxed text-[#171717]">
        {userName ? `Hi ${userName},` : 'Hi there,'} welcome to Shipyard.
        Confirm this email address to activate your account.
      </Text>

      <EmailDivider />

      <Section>
        <Text className="m-0 text-[13px] leading-relaxed text-[#6c6861]">
          This link expires in 24 hours and can be used once. If you didn&apos;t
          create a Shipyard account, you can ignore this email.
        </Text>
      </Section>
    </EmailLayout>
  );
}

VerificationEmail.Subject = SUBJECT;
