import {
  Body,
  Button,
  Container,
  Font,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'react-email';
import type { ReactElement } from 'react';
import {
  body,
  button,
  container,
  fallbackFontFamily,
  footer,
  heading,
  hr,
  interWebFont,
  paragraph,
} from './theme.js';

export interface WorkspaceInvitationEmailProps {
  /** Workspace the user is invited to */
  workspaceName: string;
  /** Role offered: Member or Admin */
  role: string;
  /** Invite link: `${WEB_URL}/invite/${token}` */
  inviteUrl: string;
  /** Inviter name, if available */
  inviterName?: string;
  /** Expiry in days, for footer copy */
  expiresInDays?: number;
}

export function WorkspaceInvitationEmail({
  workspaceName,
  role,
  inviteUrl,
  inviterName,
  expiresInDays = 7,
}: WorkspaceInvitationEmailProps): ReactElement {
  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily={fallbackFontFamily}
          webFont={interWebFont}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Inter"
          fallbackFontFamily={fallbackFontFamily}
          webFont={interWebFont}
          fontWeight={600}
          fontStyle="normal"
        />
      </Head>
      <Preview>You&apos;re invited to join {workspaceName} on Shipyard</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>
            You&apos;re invited to {workspaceName}
          </Heading>

          <Text style={paragraph}>
            {inviterName ? `${inviterName} has` : 'You have been'} invited to
            join <strong>{workspaceName}</strong> as <strong>{role}</strong> on
            Shipyard.
          </Text>

          <Section style={{ margin: '24px 0', textAlign: 'center' as const }}>
            <Button href={inviteUrl} style={button}>
              Accept invitation
            </Button>
          </Section>

          <Text style={paragraph}>
            Or copy and paste this link into your browser:
          </Text>
          <Text style={paragraph}>{inviteUrl}</Text>

          <Hr style={hr} />

          <Text style={footer}>
            This invitation expires in {expiresInDays} days and can be used only
            once. If you didn&apos;t expect this invitation, you can safely
            ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default WorkspaceInvitationEmail;
