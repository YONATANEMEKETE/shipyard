import { Cta } from '@/components/marketing/cta';
import { Hero } from '@/components/marketing/hero';
import { Mcp } from '@/components/marketing/mcp';
import { Workflows } from '@/components/marketing/workflows';

/**
 * Landing page: `/`.
 *
 * The page is complete, top to bottom: hero, what the product does, how an agent
 * gets in, and the closing call to action. All four sections share one anatomy
 * (`SectionPanel` opens each, `RuledColumns` carries the lower half where there is
 * one), so the page reads as one composition rather than four designs.
 *
 * There is no open-source section and no footer by decision, not by omission: the
 * repository's README is where self-hosting is explained, in more detail than a
 * marketing section could carry, and the header already links the changelog, the
 * repository and sign-in. The page ends on the wordmark in
 * `components/marketing/cta.tsx`.
 *
 * Build-phase checklist for this page (not yet done):
 *   - per-route `openGraph` image + metadata, `sitemap.ts`, `robots.ts`
 *   - honesty guardrail: no invented logos, testimonials or usage numbers
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <Workflows />
      <Mcp />
      <Cta />
    </>
  );
}
