import {
  Body,
  Button,
  Container,
  Font,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'react-email';
import type { ReactElement } from 'react';
import {
  body,
  button,
  container,
  fallback,
  fallbackFontFamily,
  footer,
  heading,
  hr,
  interWebFont,
  link,
  logo,
  paragraph,
} from './theme.js';

export interface EmailVerificationEmailProps {
  /** Single-use verification link (expires in 1 hour). */
  url: string;
  /** Email of the user being verified, used for the greeting. */
  userEmail?: string;
}

export function EmailVerificationEmail({
  url,
  userEmail,
}: EmailVerificationEmailProps): ReactElement {
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
      <Preview>Verify your Shipyard email</Preview>
      <Body style={body}>
        <Container style={container}>
          <Img
            src="/static/app-icon.png"
            alt="Shipyard"
            width={40}
            height={40}
            style={logo}
          />

          <Heading style={heading}>Verify your email</Heading>

          <Text style={paragraph}>
            {userEmail ? `Hi ${userEmail},` : 'Hi,'}
          </Text>

          <Text style={paragraph}>
            Welcome to Shipyard! To finish creating your account, please verify
            your email address by clicking the button below.
          </Text>

          <Section style={{ margin: '24px 0', textAlign: 'center' as const }}>
            <Button href={url} style={button}>
              Verify email
            </Button>
          </Section>

          <Text style={fallback}>
            If the button doesn&apos;t work, copy and paste this link into your
            browser:{' '}
            <Link href={url} style={link}>
              {url}
            </Link>
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            This link expires in 1 hour and is single-use. If you didn&apos;t
            create an account with Shipyard, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default EmailVerificationEmail;
