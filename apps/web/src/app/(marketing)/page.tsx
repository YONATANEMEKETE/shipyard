import { Container } from '@/components/marketing/container';
import { Hero } from '@/components/marketing/hero';

/**
 * Landing page — `/`.
 *
 * The hero is built (`components/marketing/hero.tsx`). Everything below it is
 * still PLACEHOLDER STRUCTURE: each section states what belongs there so the
 * order can be reviewed while it is built out one section at a time.
 *
 * Agreed section order:
 *  1. Hero            — built: badge, headline, hairline, promise, one CTA
 *  2. The problem     — "too simple" (Trello) vs. "too complex" (Jira)
 *  3. The five workflows — manage work · plan projects · run cycles ·
 *                          collaborate · track progress, one real UI shot each
 *  4. Developer-first — design system, dark mode, keyboard-first, ADRs, tests
 *                       (the engineering proof, on the landing page itself)
 *  5. Open source     — GitHub, one-command local setup
 *  6. Closing CTA
 *
 * Build-phase checklist for this page (not yet done):
 *   - privacy/terms pages do not exist — required before the footer links them
 *   - real product screenshots from a seeded workspace (no mockups)
 *   - per-route `openGraph` image + metadata, `sitemap.ts`, `robots.ts`
 *   - honesty guardrail: no invented logos, testimonials or usage numbers
 */

const SECTIONS = [
  {
    id: 'problem',
    eyebrow: '2 · The problem',
    heading: 'Small engineering teams are underserved',
    note: 'Too simple to grow with, or too heavy to configure. Shipyard takes the middle.',
  },
  {
    id: 'workflows',
    eyebrow: '3 · The five workflows',
    heading:
      'Manage work. Plan projects. Run cycles. Collaborate. Track progress.',
    note: 'One section per workflow, each with a real screenshot of the shipped UI.',
  },
  {
    id: 'developer-first',
    eyebrow: '4 · Developer-first',
    heading: 'Built the way the product asks you to build',
    note: 'Design system, dark mode, keyboard-first flows, ADRs, test suites, self-hosting.',
  },
  {
    id: 'open-source',
    eyebrow: '5 · Open source',
    heading: 'Read the code, run it locally',
    note: 'Repository link, one-command setup, contribution path.',
  },
  {
    id: 'closing',
    eyebrow: '6 · Closing',
    heading: 'Start with the workspace you already have',
    note: 'Final CTA into sign-up.',
  },
] as const;

export default function LandingPage() {
  return (
    <>
      <Hero />

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
