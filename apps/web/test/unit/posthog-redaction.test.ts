import { describe, it, expect } from 'vitest';

import { redactAnalyticsUrl } from '@/lib/posthog';

/**
 * The redaction runs over every URL-shaped property on the way out — the
 * pageview's own URL, a referrer, the href of the element that was clicked —
 * because an invitation link carries a single-use token in its path and the
 * verify / reset links carry one in the query string. Only the token goes: the
 * rest of the URL stays analysable.
 */
describe('redactAnalyticsUrl', () => {
  it('hides the token in an invitation path and keeps the origin', () => {
    expect(
      redactAnalyticsUrl(
        'https://shipyard.yonatanem.com/invite/cj123abc456def789ghi',
      ),
    ).toBe('https://shipyard.yonatanem.com/invite/[redacted]');
  });

  it('hides token-ish query params and leaves the rest of the query alone', () => {
    expect(
      redactAnalyticsUrl(
        'https://shipyard.yonatanem.com/reset-password?token=abc.def.ghi&next=%2Fw%2Facme',
      ),
    ).toBe(
      'https://shipyard.yonatanem.com/reset-password?token=[redacted]&next=%2Fw%2Facme',
    );
  });

  it('handles several secret params at once', () => {
    expect(
      redactAnalyticsUrl('/verify-email?token=abc&error=link%20expired'),
    ).toBe('/verify-email?token=[redacted]&error=[redacted]');
  });

  it('leaves ordinary app URLs untouched', () => {
    expect(
      redactAnalyticsUrl('https://shipyard.yonatanem.com/w/acme/issues'),
    ).toBe('https://shipyard.yonatanem.com/w/acme/issues');
    expect(redactAnalyticsUrl('https://www.google.com/search?q=shipyard')).toBe(
      'https://www.google.com/search?q=shipyard',
    );
  });

  it('does not touch a path that merely resembles one', () => {
    // `/invite` on its own has no secret to hide, and an issue titled
    // "invite/…" is not an invitation link.
    expect(redactAnalyticsUrl('https://shipyard.yonatanem.com/invite')).toBe(
      'https://shipyard.yonatanem.com/invite',
    );
  });
});
