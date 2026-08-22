import type { ReactNode } from 'react';
import {
  Body,
  Button,
  Container,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Head,
} from '@react-email/components';
import { Tailwind, pixelBasedPreset } from '@react-email/tailwind';
import { assetBaseURL, colors } from './theme.js';

export interface EmailLayoutProps {
  /** Preview line shown in the inbox list (first element inside Body). */
  preview: string;
  /** Rendered inside the white card. */
  children: ReactNode;
  /**
   * Primary call to action — exactly one per email (best practice).
   * Omit for informational emails without an action.
   */
  cta?: { label: string; href: string };
}

/**
 * Shared Shipyard email shell — Harbor Amber light theme.
 *
 * Rules baked in (react-email best practices):
 * - 600px single column, one CTA, plain-text part rendered separately.
 * - Button/`Hr`/borders always carry an explicit border type; button uses
 *   `box-border` so the padding doesn't overflow.
 * - No media queries, no SVG, no dark mode (email-client limits).
 */
export function EmailLayout({ preview, children, cta }: EmailLayoutProps) {
  const logoURL = `${assetBaseURL}/static/logo.png`;

  return (
    <Html lang="en">
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
          theme: {
            extend: {
              colors: {
                brand: colors.brand,
                ink: colors.ink,
              },
              borderRadius: { em: '12px' },
            },
          },
        }}
      >
        <Head />
        <Body className="bg-[#f4f3ef] font-sans">
          <Preview>{preview}</Preview>
          <Container className="mx-auto w-full max-w-[600px] px-4 py-8">
            <Section className="mb-6 text-center">
              <Img
                src={logoURL}
                alt="Shipyard"
                width={36}
                height={36}
                className="mx-auto block rounded-[8px]"
              />
              <Text className="m-0 mt-2 text-[17px] font-semibold tracking-tight text-[#171717]">
                Shipyard
              </Text>
            </Section>

            <Section className="border-solid border-[#dedcd5] bg-white rounded-[12px] border p-8">
              {children}

              {cta ? (
                <Section className="mt-6 text-center">
                  <Button
                    href={cta.href}
                    className="box-border border-solid border-[#b45309] rounded-[8px] bg-[#b45309] px-8 py-3 text-center text-[15px] font-semibold text-white no-underline"
                  >
                    {cta.label}
                  </Button>
                </Section>
              ) : null}
            </Section>

            <Section className="mt-6 px-4 text-center">
              <Text className="m-0 text-[12px] leading-relaxed text-[#6c6861]">
                You received this email because of activity on your Shipyard
                account.
              </Text>
              <Text className="m-0 mt-1 text-[12px] leading-relaxed text-[#6c6861]">
                If you didn&apos;t request this, you can safely ignore it — no
                action is needed.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

/** Thematic divider for in-card sections. */
export function EmailDivider() {
  return <Hr className="border-solid border-[#dedcd5] my-6" />;
}

/** Fallback plain link line under the CTA (button styles vary by client). */
export function FallbackLink({ href }: { href: string }) {
  return (
    <Text className="mt-4 text-center text-[12px] text-[#6c6861]">
      If the button doesn&apos;t work, paste this link into your browser:{' '}
      <a href={href} className="text-[#b45309] underline">
        {href}
      </a>
    </Text>
  );
}
