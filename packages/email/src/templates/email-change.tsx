import { EmailDivider, EmailLayout } from '../layout.js';
import { Section, Text } from '@react-email/components';

export interface EmailChangeEmailProps {
  userName?: string;
  /** The pending (not yet active) email address. */
  newEmail: string;
  /** The single-use link that confirms the change. */
  actionUrl: string;
}

const SUBJECT = 'Confirm your new Shipyard email';

/**
 * Sent on email-change request (F1 §3.9). Your current email stays active
 * until this link is confirmed.
 */
export function EmailChangeEmail({
  userName,
  newEmail,
  actionUrl,
}: EmailChangeEmailProps) {
  return (
    <EmailLayout
      preview="Confirm your new Shipyard email address"
      cta={{ label: 'Confirm email change', href: actionUrl }}
    >
      <Text className="m-0 text-[24px] font-semibold text-[#171717]">
        Confirm your new email
      </Text>
      <Text className="mt-2 text-[15px] leading-relaxed text-[#171717]">
        {userName ? `Hi ${userName},` : 'Hi there,'} confirm that{' '}
        <span className="font-medium">{newEmail}</span> is your new Shipyard
        email address.
      </Text>

      <EmailDivider />

      <Section>
        <Text className="m-0 text-[13px] leading-relaxed text-[#6c6861]">
          Your current email continues to work until this change is confirmed.
          If you didn&apos;t request this, you can ignore this email.
        </Text>
      </Section>
    </EmailLayout>
  );
}

EmailChangeEmail.Subject = SUBJECT;
