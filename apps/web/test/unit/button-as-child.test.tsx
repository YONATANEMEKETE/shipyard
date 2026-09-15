import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Button } from '@/components/ui/button';

/**
 * `Button asChild` regression guard.
 *
 * The `asChild` branch used to apply only `legacyClass` + `className`, dropping
 * the base, size and variant classes. An anchor came out as an inline link that
 * kept the button's height and padding classes but none of its alignment,
 * colour or hover — visible as clipped, off-centre label text. Asserting on the
 * rendered class list is the only way to catch that without a browser.
 */
describe('Button asChild', () => {
  it('renders a real button, not a bare anchor', () => {
    render(
      <Button asChild>
        <a href="/forgot-password">Email me a password link</a>
      </Button>,
    );

    const link = screen.getByRole('link', {
      name: /email me a password link/i,
    });

    expect(link).toHaveAttribute('href', '/forgot-password');
    // Alignment: without these the label sits inline and the height is ignored.
    expect(link.className).toContain('inline-flex');
    expect(link.className).toContain('items-center');
    expect(link.className).toContain('justify-center');
    // Variant colour + hover, which an unstyled anchor never had.
    expect(link.className).toContain('bg-primary');
    expect(link.className).toContain('hover:bg-primary/90');
    // Default size.
    expect(link.className).toContain('h-9');
    expect(link.className).toContain('px-4');
  });

  it('lets the caller overrule size, radius and variant', () => {
    render(
      <Button
        asChild
        variant="outline"
        className="h-8 rounded-lg px-3.5 text-xs bg-ds-brand"
      >
        <a href="/somewhere">Go</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: /go/i });

    // tailwind-merge resolves each conflict toward the caller's class.
    expect(link.className).toContain('h-8');
    expect(link.className).toContain('rounded-lg');
    expect(link.className).toContain('px-3.5');
    expect(link.className).toContain('text-xs');
    expect(link.className).toContain('bg-ds-brand');
    expect(link.className).not.toContain('h-9');
    expect(link.className).not.toContain('rounded-md');
  });
});
