'use client';

import { useEffect, use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Ban, Check, Clock, Mail, ShieldCheck, X } from 'lucide-react';

import type { InvitationPreview, InvitationStatus } from '@shipyard/shared';

import { StatefulButton } from '@/components/motion/button/stateful';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { IconWrapper } from '@/components/workspace/icon-wrapper';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import {
  InvitationsApiError,
  useAcceptInvitation,
  useDeclineInvitation,
  useInvitationPreview,
} from '@/hooks/use-invitations';
import { inviteResumePath, resumeHref } from '@/lib/auth/next-redirect';

type PageProps = { params: Promise<{ token: string }> };

/**
 * Invitation preview / accept / decline — `/invite/:token` (token-gated).
 *
 * Preview loads through useInvitationPreview (the API returns 200 with a
 * `status` even when the invitation is no longer usable, so the UI decides
 * between the live accept card and a terminal state without extra calls).
 *
 * States:
 *  - loading                → staggered skeleton card
 *  - UNAUTHENTICATED        → sign-in / create-account CTA (the token URL is
 *                             preserved so the auth flow can resume to it)
 *  - other error            → ErrorState with retry
 *  - status !== PENDING     → terminal screen (Accepted / Revoked / Declined /
 *                             Expired) with the right guidance copy
 *  - PENDING                → live accept / decline via the real mutations
 *
 * Accept navigates to /w/:workspaceSlug on success (the mutation returns the
 * slug). Decline refetches the preview — the server flips it to DECLINED, and
 * the page falls through to the terminal screen. A 409 status conflict
 * (expired / already-used) also refetches, so the truth of the invitation
 * renders instead of a stale accept card.
 */
const TERMINAL_COPY: Record<
  Exclude<InvitationStatus, 'PENDING'>,
  { icon: typeof Check; title: string; description: string }
> = {
  ACCEPTED: {
    icon: Check,
    title: "You're already a member",
    description:
      'This invitation was already accepted. Head to your workspaces to pick up where you left off.',
  },
  REVOKED: {
    icon: Ban,
    title: 'Invitation revoked',
    description:
      'A workspace admin revoked this invitation before it was accepted. Contact the workspace owner to request access.',
  },
  DECLINED: {
    icon: X,
    title: 'Invitation declined',
    description:
      'You declined this invitation, so it can no longer be accepted. Ask the workspace owner to send a new one if you changed your mind.',
  },
  EXPIRED: {
    icon: Clock,
    title: 'Invitation expired',
    description:
      'This invitation link has expired — invitations last 7 days. Ask the workspace owner to send a new one.',
  },
};

export default function InviteTokenPage({ params }: PageProps) {
  const { token } = use(params);
  const router = useRouter();

  const preview = useInvitationPreview(token);
  const invitation = preview.data;

  // Already a member (e.g. replayed link, accepted earlier, joined another
  // way) — the accept card is pointless; go straight into the workspace.
  const isExistingMember = Boolean(invitation?.isMember);
  useEffect(() => {
    if (isExistingMember && invitation?.workspaceSlug) {
      router.replace(`/w/${invitation.workspaceSlug}`);
    }
  }, [isExistingMember, invitation?.workspaceSlug, router]);

  const unauth =
    preview.isError &&
    preview.error instanceof InvitationsApiError &&
    // API session guard answers 401 UNAUTHORIZED (codes.ts); UNAUTHENTICATED
    // kept as a defensive alias in case a future path uses it.
    (preview.error.code === 'UNAUTHORIZED' ||
      preview.error.code === 'UNAUTHENTICATED');

  // ── Skeleton (loading, or redirecting into a workspace the user is
  //    already a member of) ─────────────────────────────────────────────
  if (preview.isPending || isExistingMember) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-ds-bg px-4 py-10">
        <Stagger className="flex w-full max-w-[580px] flex-col items-center gap-4">
          <StaggerItem>
            <p className="font-mono text-[10px] font-semibold tracking-[1.2px] text-ds-text-muted">
              INVITATION
            </p>
          </StaggerItem>
          <StaggerItem className="flex w-full flex-col items-center gap-4">
            <div className="flex w-full flex-col items-center gap-2.5">
              <span className="inline-grid size-12 animate-pulse place-items-center rounded-xl bg-ds-border/60" />
              <span className="h-[34px] w-64 max-w-full animate-pulse rounded bg-ds-border/60" />
              <span className="h-4 w-96 max-w-full animate-pulse rounded bg-ds-border/40" />
            </div>
            <div className="flex w-[520px] max-w-full items-center gap-2.5 border-b border-ds-border px-0 py-3">
              <span className="h-3 w-40 animate-pulse rounded bg-ds-border/40" />
            </div>
            <div className="flex w-[520px] max-w-full flex-col gap-3">
              <span className="h-9 w-full animate-pulse rounded-md bg-ds-border/60" />
              <span className="h-9 w-full animate-pulse rounded-md bg-ds-border/40" />
            </div>
          </StaggerItem>
        </Stagger>
      </div>
    );
  }

  // ── Error / no session ───────────────────────────────────────────────────
  if (preview.isError && !invitation) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-ds-bg px-4 py-10">
        <Stagger className="flex w-full max-w-[580px] flex-col items-center gap-4">
          <StaggerItem>
            <p className="font-mono text-[10px] font-semibold tracking-[1.2px] text-ds-text-muted">
              INVITATION
            </p>
          </StaggerItem>

          {unauth ? (
            <StaggerItem className="flex w-full flex-col items-center gap-4">
              <div className="flex w-full flex-col items-center gap-2.5">
                <span
                  aria-hidden
                  className="inline-grid size-12 place-items-center rounded-xl border border-ds-brand/40 bg-ds-brand-soft"
                >
                  <Mail className="size-5 text-ds-brand" aria-hidden />
                </span>
                <h1 className="text-balance w-full text-center text-[34px] font-bold leading-[1.12] tracking-[-1.1px] text-ds-text">
                  Sign in to accept your invitation
                </h1>
                <p className="text-balance w-full max-w-[440px] text-center text-[13px] font-normal leading-[1.6] text-ds-text-muted">
                  You need an account to view and accept this invitation. It
                  stays valid for 7 days — the link in your inbox will bring you
                  right back here.
                </p>
              </div>

              <div className="flex w-[520px] max-w-full flex-col gap-3">
                <Link
                  href={resumeHref('/sign-in', inviteResumePath(token))}
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-ds-brand text-sm font-semibold text-white transition-colors hover:bg-ds-brand/90"
                >
                  Sign in
                </Link>
                <Link
                  href={resumeHref('/sign-up', inviteResumePath(token))}
                  className="inline-flex h-9 w-full items-center justify-center rounded-md border border-ds-border bg-ds-surface text-sm font-medium text-foreground transition-colors hover:border-ds-border-strong"
                >
                  Create an account
                </Link>
              </div>
            </StaggerItem>
          ) : (
            <ErrorState
              title="Couldn't load invitation"
              description="We ran into a problem fetching this invitation. Check the link and try again in a moment."
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void preview.refetch()}
                  className="h-8 gap-2 rounded-md border-ds-border bg-ds-surface px-3 text-xs font-semibold text-foreground"
                >
                  Try again
                </Button>
              }
            />
          )}
        </Stagger>
      </div>
    );
  }

  // ── Terminal statuses (not usable) ───────────────────────────────────────
  if (invitation && invitation.status !== 'PENDING') {
    const copy = TERMINAL_COPY[invitation.status];
    const Icon = copy.icon;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-ds-bg px-4 py-10">
        <Stagger className="flex w-full max-w-[580px] flex-col items-center gap-4">
          <StaggerItem>
            <p className="font-mono text-[10px] font-semibold tracking-[1.2px] text-ds-text-muted">
              INVITATION
            </p>
          </StaggerItem>
          <StaggerItem className="flex w-full flex-col items-center gap-2.5">
            <span
              aria-hidden
              className="inline-grid size-12 place-items-center rounded-xl border border-ds-border bg-ds-surface"
            >
              <Icon className="size-5 text-ds-text-muted" aria-hidden />
            </span>
            <h1 className="text-balance text-center text-[34px] font-bold leading-[1.12] tracking-[-1.1px] text-ds-text">
              {copy.title}
            </h1>
            <p className="text-balance w-full text-center text-[13px] font-normal leading-[1.5] text-ds-text-muted">
              {copy.description}
            </p>
          </StaggerItem>
          <StaggerItem className="flex w-[520px] max-w-full items-center justify-center">
            <Button
              type="button"
              onClick={() => router.replace('/select-workspace')}
              className="h-9 gap-2 rounded-md bg-ds-brand px-4 text-sm font-semibold text-white hover:bg-ds-brand/90"
            >
              Go to your workspaces
            </Button>
          </StaggerItem>
        </Stagger>
      </div>
    );
  }

  // ── Live accept / decline card ───────────────────────────────────────────
  return <LiveInviteCard token={token} invitation={invitation!} />;
}

function LiveInviteCard({
  token,
  invitation,
}: {
  token: string;
  invitation: InvitationPreview;
}) {
  const router = useRouter();
  const preview = useInvitationPreview(token);

  const [acceptState, setAcceptState] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [declineState, setDeclineState] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [errorNote, setErrorNote] = useState<string | null>(null);

  // After an accept/decline that violates current state, the preview owns the
  // truth — refetch so the page falls through to the terminal / next screen.
  const refreshAfterConflict = () => void preview.refetch();

  const acceptMutation = useAcceptInvitation({
    onSuccess: (data) => {
      setAcceptState('success');
      router.replace(`/w/${data.workspaceSlug}`);
    },
    onError: (error) => {
      setAcceptState('error');
      setErrorNote(error.message);
      if (error.status === 409) refreshAfterConflict();
    },
  });

  const declineMutation = useDeclineInvitation({
    onSuccess: () => {
      setDeclineState('success');
      // Server flips the invitation to DECLINED — refetch renders the fallthrough.
      refreshAfterConflict();
    },
    onError: (error) => {
      setDeclineState('error');
      setErrorNote(error.message);
      if (error.status === 409) refreshAfterConflict();
    },
  });

  const isBusy = acceptState === 'loading' || declineState === 'loading';

  const handleAccept = () => {
    setErrorNote(null);
    setAcceptState('loading');
    acceptMutation.mutate({ token });
  };

  const handleDecline = () => {
    setErrorNote(null);
    setDeclineState('loading');
    declineMutation.mutate({ token });
  };

  // EMAIL_NOT_VERIFIED — the gate from spec §3.2; send the user to verify.
  const needsVerification =
    (errorNote &&
      acceptMutation.isError &&
      acceptMutation.error instanceof InvitationsApiError &&
      acceptMutation.error.code === 'EMAIL_NOT_VERIFIED') ||
    (declineMutation.isError &&
      declineMutation.error instanceof InvitationsApiError &&
      declineMutation.error.code === 'EMAIL_NOT_VERIFIED');

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ds-bg px-4 py-10">
      <Stagger className="flex w-full max-w-[580px] flex-col items-center gap-4">
        <StaggerItem>
          <p className="font-mono text-[10px] font-semibold tracking-[1.2px] text-ds-text-muted">
            INVITATION
          </p>
        </StaggerItem>

        <StaggerItem className="flex w-full flex-col items-center gap-4">
          <div className="flex w-full flex-col items-center gap-2.5">
            <span
              aria-hidden
              className="inline-grid size-12 place-items-center rounded-xl border border-ds-brand/40 bg-ds-brand-soft"
            >
              <IconWrapper
                icon={invitation.workspaceIcon}
                size="md"
                variant="soft"
                className="border-0 bg-transparent"
              />
            </span>
            <h1 className="text-balance text-center text-[34px] font-bold leading-[1.12] tracking-[-1.1px] text-ds-text">
              Join {invitation.workspaceName}
            </h1>
            <p className="text-balance w-full text-center text-[13px] font-normal text-ds-text-muted">
              You&apos;ve been invited to join this workspace. You&apos;ll gain
              access after you accept.
            </p>
          </div>

          <div className="flex w-[520px] max-w-full items-center gap-2.5 border-b border-ds-border px-0 py-3">
            <Mail
              className="size-[14px] shrink-0 text-ds-text-muted"
              aria-hidden
            />
            <span className="flex grow items-center gap-1.5">
              <span className="text-[10px] font-medium text-ds-text-muted">
                Invited as ·&nbsp;
              </span>
              <span className="text-[12px] font-semibold text-ds-text">
                {invitation.email}
              </span>
            </span>
            <span className="inline-flex h-[22px] items-center justify-center rounded-full border border-transparent px-2.5 font-mono text-[10px] font-semibold tracking-[0.4px] text-ds-text-muted">
              {invitation.role}
            </span>
          </div>

          <p className="w-full text-center text-[12px] font-normal leading-[1.5] text-ds-text-muted">
            Pending invitations don&apos;t grant access until accepted.
          </p>

          <div className="flex w-[520px] max-w-full flex-col gap-3">
            <StatefulButton
              type="button"
              size="md"
              className="h-9 w-full rounded-md bg-ds-brand text-sm font-semibold text-white hover:bg-ds-brand/90"
              icon={<Check className="h-4 w-4" />}
              state={acceptState}
              loadingText="Accepting…"
              successText="Accepted"
              errorText="Try again"
              onClick={handleAccept}
              disabled={isBusy}
            >
              Accept invitation
            </StatefulButton>

            <StatefulButton
              type="button"
              variant="ghost"
              size="md"
              className="h-9 w-full rounded-md text-sm font-medium"
              icon={<X className="h-4 w-4" />}
              state={declineState}
              loadingText="Declining…"
              successText="Declined"
              errorText="Try again"
              onClick={handleDecline}
              disabled={isBusy}
            >
              Decline
            </StatefulButton>

            {errorNote ? (
              <p
                role="alert"
                className="flex w-full flex-col items-center gap-1 text-center text-[12px] font-normal leading-[1.5] text-ds-danger"
              >
                <span>{errorNote}</span>
                {needsVerification ? (
                  <a
                    href="/verify-email"
                    className="font-semibold underline underline-offset-2 hover:text-ds-danger/80"
                  >
                    Verify your email
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>
        </StaggerItem>

        <StaggerItem className="flex w-full items-center justify-center gap-1.5">
          <ShieldCheck
            className="size-3 shrink-0 text-ds-text-muted"
            aria-hidden
          />
          <p className="text-center text-[11px] font-normal text-ds-text-muted">
            Verified email required to accept. If you don&apos;t have an
            account, you&apos;ll create one first.
          </p>
        </StaggerItem>
      </Stagger>
    </div>
  );
}
