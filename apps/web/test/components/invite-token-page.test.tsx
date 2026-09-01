import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { InvitationPreview } from '@shipyard/shared';

import { InviteFlow } from '@/app/invite/[token]/page';

// ── Module mocks ────────────────────────────────────────────────────────────
// The page is data-driven by the invitations hooks; each test controls what
// the hooks return. InvitationsApiError is exported as a real class so the
// page's `instanceof` checks behave. Everything lives in vi.hoisted because
// vi.mock factories are hoisted above module-level declarations.
const mocks = vi.hoisted(() => {
  class InvitationsApiError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(args: { code: string; message: string; status: number }) {
      super(args.message);
      this.name = 'InvitationsApiError';
      this.code = args.code;
      this.status = args.status;
    }
  }

  return {
    InvitationsApiError,
    urlReplace: vi.fn(),
    useInvitationPreview: vi.fn(),
    useAcceptInvitation: vi.fn(),
    useDeclineInvitation: vi.fn(),
  };
});

const {
  InvitationsApiError,
  urlReplace,
  useInvitationPreview,
  useAcceptInvitation,
  useDeclineInvitation,
} = mocks;

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mocks.urlReplace,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-invitations', () => ({
  InvitationsApiError: mocks.InvitationsApiError,
  useInvitationPreview: mocks.useInvitationPreview,
  useAcceptInvitation: mocks.useAcceptInvitation,
  useDeclineInvitation: mocks.useDeclineInvitation,
}));

// ── Helpers ─────────────────────────────────────────────────────────────────
const TOKEN = 'tok_abc';

function preview(o: {
  status: InvitationPreview['status'];
  isMember?: boolean;
  workspaceSlug?: string;
}): InvitationPreview {
  return {
    workspaceName: 'Harbor Labs',
    workspaceIcon: 'anchor',
    workspaceSlug: o.workspaceSlug ?? 'harbor-labs',
    role: 'ADMIN',
    email: 'alex@harbor.test',
    expiresAt: '2026-08-30T09:00:00.000Z',
    status: o.status,
    isMember: o.isMember ?? false,
  };
}

function idlePreviewResult(o: {
  status: InvitationPreview['status'];
  isMember?: boolean;
  workspaceSlug?: string;
}) {
  return {
    data: preview(o),
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
}

/** Default mutation shape — inert until a test wires onSuccess/onError. */
function mutation(opts?: {
  onSuccess?: (...args: unknown[]) => void;
  onError?: (...args: unknown[]) => void;
}) {
  return {
    isPending: false,
    isError: false,
    error: null,
    mutate: vi.fn((vars: unknown) => {
      void vars;
    }),
  };
}

// The flow is rendered directly with a plain token string — the Next page's
// React `use(params)` never resumes on native promises under jsdom, so the
// token comes in as a prop instead.
const renderPage = () => render(<InviteFlow token={TOKEN} />);

beforeEach(() => {
  urlReplace.mockClear();
  useInvitationPreview.mockReset();
  useAcceptInvitation.mockReset().mockReturnValue(mutation());
  useDeclineInvitation.mockReset().mockReturnValue(mutation());
});

describe('InviteTokenPage — invitation preview flow states', () => {
  it('renders a staggered skeleton while the preview loads', async () => {
    useInvitationPreview.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
    });

    renderPage();

    expect(await screen.findByText('INVITATION')).toBeInTheDocument();
    expect(screen.queryByText('Harbor Labs')).not.toBeInTheDocument();
  });

  it('shows the sign-in / create-account CTA with resume links when unauthenticated', async () => {
    useInvitationPreview.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new InvitationsApiError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        status: 401,
      }),
    });

    renderPage();

    expect(
      await screen.findByText('Sign in to accept your invitation'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      `/sign-in?next=${encodeURIComponent(`/invite/${TOKEN}`)}`,
    );
    expect(
      screen.getByRole('link', { name: 'Create an account' }),
    ).toHaveAttribute(
      'href',
      `/sign-up?next=${encodeURIComponent(`/invite/${TOKEN}`)}`,
    );
  });

  it('shows the generic error state with try-again when the fetch fails', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    useInvitationPreview.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new InvitationsApiError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'boom',
        status: 500,
      }),
      refetch,
    });

    renderPage();

    expect(
      await screen.findByText(/couldn't load invitation/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ACCEPTED', "You're already a member"],
    ['REVOKED', 'Invitation revoked'],
    ['DECLINED', 'Invitation declined'],
    ['EXPIRED', 'Invitation expired'],
  ])(
    'renders the terminal screen for %s without an accept card',
    async (status: string, title) => {
      const user = userEvent.setup();
      useInvitationPreview.mockReturnValue(
        idlePreviewResult({ status: status as InvitationPreview['status'] }),
      );

      renderPage();

      expect(await screen.findByText(title)).toBeInTheDocument();
      // No accept/decline affordances on a dead invitation.
      expect(
        screen.queryByRole('button', { name: /accept invitation/i }),
      ).toBeNull();
      expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull();

      await user.click(
        screen.getByRole('button', { name: /go to your workspaces/i }),
      );
      expect(urlReplace).toHaveBeenCalledWith('/select-workspace');
    },
  );

  it('redirects a member straight into the workspace — no accept card', async () => {
    useInvitationPreview.mockReturnValue(
      idlePreviewResult({
        status: 'PENDING',
        isMember: true,
        workspaceSlug: 'harbor-labs',
      }),
    );

    renderPage();

    await waitFor(() =>
      expect(urlReplace).toHaveBeenCalledWith('/w/harbor-labs'),
    );
    expect(
      screen.queryByRole('button', { name: /accept invitation/i }),
    ).toBeNull();
  });

  it('renders the live accept card for a pending invitation', async () => {
    useInvitationPreview.mockReturnValue(
      idlePreviewResult({ status: 'PENDING' }),
    );

    renderPage();

    expect(await screen.findByText('Join Harbor Labs')).toBeInTheDocument();
    expect(screen.getByText('alex@harbor.test')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /accept invitation/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
  });
});

describe('InviteTokenPage — accept / decline actions', () => {
  it('accepts and navigates into the workspace with the returned slug', async () => {
    const user = userEvent.setup();
    useInvitationPreview.mockReturnValue(
      idlePreviewResult({ status: 'PENDING' }),
    );
    useAcceptInvitation.mockImplementation((opts) => ({
      isError: false,
      error: null,
      mutate: (vars: { token: string }) => {
        opts?.onSuccess?.(
          {
            member: { id: 'mem_1' } as never,
            workspaceSlug: 'harbor-labs',
          },
          vars,
        );
      },
    }));

    renderPage();

    await user.click(
      await screen.findByRole('button', { name: /accept invitation/i }),
    );
    expect(urlReplace).toHaveBeenCalledWith('/w/harbor-labs');
  });

  it('declines, shows the declined confirmation beat and refetches the preview', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue(undefined);
    useInvitationPreview.mockReturnValue({
      ...idlePreviewResult({ status: 'PENDING' }),
      refetch,
    });
    useDeclineInvitation.mockImplementation((opts) => ({
      isError: false,
      error: null,
      mutate: (vars: { token: string }) => {
        opts?.onSuccess?.({ id: 'inv_1' } as never, vars);
      },
    }));

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Decline' }));
    expect(
      screen.getByRole('button', { name: 'Declined' }),
    ).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces an unverified-email error with the verify link on accept', async () => {
    const user = userEvent.setup();
    useInvitationPreview.mockReturnValue(
      idlePreviewResult({ status: 'PENDING' }),
    );
    useAcceptInvitation.mockImplementation((opts) => ({
      isError: true,
      error: new InvitationsApiError({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Your email is not verified',
        status: 403,
      }),
      mutate: (vars: { token: string }) => {
        opts?.onError?.(
          new InvitationsApiError({
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Your email is not verified',
            status: 403,
          }),
          vars,
        );
      },
    }));

    renderPage();

    await user.click(
      await screen.findByRole('button', { name: /accept invitation/i }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /email is not verified/i,
    );
    expect(
      screen.getByRole('link', { name: /verify your email/i }),
    ).toHaveAttribute('href', '/verify-email');
  });
});
