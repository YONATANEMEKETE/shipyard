import { Container } from '@/components/marketing/container';
import { Hero } from '@/components/marketing/hero';
import { Workflows } from '@/components/marketing/workflows';

/**
 * Landing page — `/`.
 *
 * The hero and the workflows section are built (`components/marketing/hero.tsx`,
 * `components/marketing/workflows.tsx`). Everything below them is still
 * PLACEHOLDER STRUCTURE: each section states what belongs there so the order can
 * be reviewed while it is built out one section at a time.
 *
 * Agreed order:
 *  1. Hero       — built: badge, headline, one CTA, product band
 *  2. Workflows  — built: intro panel + three cards
 *  3. MCP        — the agent surface: tokens, scopes, attributed actions
 *  4. Open source — repository link, one-command setup, contribution path
 *  5. Closing CTA
 *
 * Build-phase checklist for this page (not yet done):
 *   - privacy/terms pages do not exist — required before the footer links them
 *   - per-route `openGraph` image + metadata, `sitemap.ts`, `robots.ts`
 *   - honesty guardrail: no invented logos, testimonials or usage numbers
 */

const SECTIONS = [
  {
    id: 'mcp',
    eyebrow: '3 · MCP',
    heading: 'Your agents work in the same workspace',
    note: 'A token belongs to one member and one workspace; agent actions are the member’s own actions, attributed in history and activity.',
  },
  {
    id: 'open-source',
    eyebrow: '4 · Open source',
    heading: 'Read the code, run it locally',
    note: 'Repository link, one-command setup, contribution path.',
  },
  {
    id: 'closing',
    eyebrow: '5 · Closing',
    heading: 'Start with the workspace you already have',
    note: 'Final CTA into sign-up.',
  },
] as const;

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Workflows />

      {SECTIONS.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className="border-b border-dashed border-ds-border"
        >
          <Container className="py-16 sm:py-24">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-ds-text-muted">
              {section.eyebrow}
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {section.heading}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-ds-text-muted">
              {section.note}
            </p>
          </Container>
        </section>
      ))}
    </>
  );
}
