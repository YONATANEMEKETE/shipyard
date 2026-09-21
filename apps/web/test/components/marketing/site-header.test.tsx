import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockSession: {
  data: { user: { id: string; name: string } } | null;
  isPending: boolean;
} = { data: null, isPending: false };

vi.mock('@/hooks/use-session', () => ({
  useSession: () => mockSession,
}));

import {
  REPOSITORY_URL,
  SiteHeader,
  X_URL,
} from '@/components/marketing/site-header';

/**
 * The header is the marketing surface's navigation: brand back to the landing
 * page, the two links that exist, and calls to action that depend on the
 * visitor's session. Structure and reachability are what matter here — visual
 * treatment is the canvas's job.
 */
describe('SiteHeader', () => {
  beforeEach(() => {
    mockSession.data = null;
    mockSession.isPending = false;
  });

  it('sends the brand lockup back to the landing page', () => {
    render(<SiteHeader />);

    expect(
      screen.getByRole('link', { name: 'Shipyard — home' }),
    ).toHaveAttribute('href', '/');
  });

  it('links to the pages that exist in the centre group', () => {
    render(<SiteHeader />);

    const nav = screen.getByRole('navigation', { name: 'Marketing' });

    expect(nav).toHaveTextContent('X');
    expect(nav).toHaveTextContent('GitHub');
    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute(
      'href',
      X_URL,
    );
  });

  it('opens the repository in a new tab without leaking the referrer', () => {
    render(<SiteHeader />);

    const repository = screen.getByRole('link', { name: 'GitHub' });

    expect(repository).toHaveAttribute('href', REPOSITORY_URL);
    expect(repository).toHaveAttribute('target', '_blank');
    expect(repository).toHaveAttribute('rel', 'noreferrer');
  });

  it('offers the way in to a signed-out visitor', () => {
    render(<SiteHeader />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/sign-in',
    );
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      '/sign-up',
    );
  });

  it('offers the way back to work once a session exists', () => {
    mockSession.data = { user: { id: 'u1', name: 'Ada' } };

    render(<SiteHeader />);

    expect(
      screen.getByRole('link', { name: 'Go to workspace' }),
    ).toHaveAttribute('href', '/w');
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Get started' })).toBeNull();
  });

  it('claims no session state while the session is still loading', () => {
    mockSession.isPending = true;

    render(<SiteHeader />);

    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Get started' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Go to workspace' })).toBeNull();
  });
});
