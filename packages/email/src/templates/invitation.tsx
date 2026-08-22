import { EmailDivider, EmailLayout } from '../layout.js';
import { Section, Text } from '@react-email/components';

/**
 * Workspace invitation (F3 members module — scaffolded now so the contract
 * exists; not sent yet).
 *
 * F3 extends this: accepted/declined handling lives in members, and the
 * subject/CTA wording will be reviewed against the members spec then.
 */
export interface InvitationEmailProps {
  workspaceName: string;
  inviterName: string;
  /** Join link (invitation accept token, single-use). */
  actionUrl: string;
  /** Role the invite grants — never 'owner' (F3 invariant). */
  role?: 'admin' | 'member';
}

export function invitationSubject({
  workspaceName,
}: InvitationEmailProps): string {
  return `You're invited to join ${workspaceName} on Shipyard`;
}

/**
 * Sent by the members module (F3) when a workspace member invites someone.
 */
export function InvitationEmail({
  workspaceName,
  inviterName,
  actionUrl,
  role,
}: InvitationEmailProps) {
  return (
    <EmailLayout
      preview={`${inviterName} invited you to join ${workspaceName} on Shipyard`}
      cta={{ label: 'Accept invitation', href: actionUrl }}
    >
      <Text className="m-0 text-[24px] font-semibold text-[#171717]">
        You&apos;re invited to {workspaceName}
      </Text>
      <Text className="mt-2 text-[15px] leading-relaxed text-[#171717]">
        <span className="font-medium">{inviterName}</span> invited you to join{' '}
        <span className="font-medium">{workspaceName}</span> on Shipyard
        {role ? ` as ${role}` : ''}.
      </Text>

      <EmailDivider />

      <Section>
        <Text className="m-0 text-[13px] leading-relaxed text-[#6c6861]">
          This invitation link can be used once. If you don&apos;t have a
          Shipyard account yet, you&apos;ll be able to create one when you
          accept.
        </Text>
      </Section>
    </EmailLayout>
  );
}

InvitationEmail.Subject = invitationSubject;
